import path from "path";
import fs from "fs";
import os from "os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-archive-msg-"));
const rosterFile = path.join(tempDir, "roster.md");

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: tempDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TESTPROJ",
    path: tempDir,
    roster: rosterFile,
    status: "active",
  }),
  getProjects: () => [
    {
      name: "TESTPROJ",
      path: tempDir,
      roster: rosterFile,
      status: "active",
    },
  ],
}));

import { archiveMessage } from "../services/archive-message";
import { writeMail } from "../services/write-mail";
import { initMail } from "../services/init-mail";
import { ensureHumanInRoster } from "../lib/roster-utils";

// Helper to get the timestamp of the first message in a mailbox
function getFirstMessageTimestamp(mailboxPath: string): string {
  const content = fs.readFileSync(mailboxPath, "utf-8");
  const match = content.match(/\/\/ (\d{8}-\d{4}) \/\//);
  if (!match) {
    throw new Error("Could not find timestamp in mailbox");
  }
  return match[1];
}

describe("archive message", () => {
  let testTimestamp: string;

  beforeEach(() => {
    // Clean up any existing files
    if (fs.existsSync(tempDir)) {
      for (const entry of fs.readdirSync(tempDir)) {
        fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
      }
    }
    // Create roster file
    const rosterHeader = "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n";
    fs.writeFileSync(rosterFile, rosterHeader);

    // Initialize mailboxes
    initMail("TESTPROJ", "SENDER", "Tester", "mailbox_SENDER.md", "active");
    initMail("TESTPROJ", "RECIPIENT", "Tester", "mailbox_RECIPIENT.md", "active");

    // V2.9: HUMAN cross-project handle must be present in this roster too,
    // because the legacy mail-routing special case is gone.
    ensureHumanInRoster(tempDir, rosterFile);
    // Re-create files because initMail notes its presence now (archive path needs to exist).
    fs.writeFileSync(path.join(tempDir, "mailbox_HUMAN.md"), "<!-- END -->\n");
    fs.writeFileSync(path.join(tempDir, "mailbox_HUMAN_archive.md"), "<!-- END -->\n");
    fs.writeFileSync(path.join(tempDir, "outbox_HUMAN.md"), "<!-- END -->\n");

    // Write a test message
    writeMail(
      "TESTPROJ",
      "SENDER",
      "RECIPIENT",
      "M",
      "Test Subject",
      "Test body"
    );

    // Get the actual timestamp from the written message
    testTimestamp = getFirstMessageTimestamp(path.join(tempDir, "mailbox_RECIPIENT.md"));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should archive a single message", () => {
    const result = archiveMessage(
      "TESTPROJ",
      "RECIPIENT",
      "SENDER",
      testTimestamp,
      "Test Subject"
    );

    expect(result.status).toBe("archived");
    expect(result.archived_message).toBeDefined();
    expect(result.archived_message.subject).toBe("Test Subject");
  });

  test("should throw error when message not found", () => {
    expect(() => {
      archiveMessage(
        "TESTPROJ",
        "RECIPIENT",
        "SENDER",
        "20990101-0000",
        "Non-existent"
      );
    }).toThrow();
  });

  test("regression: archive a message sent with qualified same-project sender PROJ/HANDLE", () => {
    // Reproduces the sender-resolution asymmetry: a message written with a
    // qualified sender "TESTPROJ/SENDER" and senderProjectHandle === project
    // was stored qualified at write time but resolved bare at archive time,
    // so archive threw MessageNotFoundError.
    writeMail(
      "TESTPROJ",
      "TESTPROJ/SENDER",
      "RECIPIENT",
      "M",
      "Qualified Subject",
      "Qualified body",
      undefined,
      "TESTPROJ"
    );

    const inboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    const qualifiedMatch = inboxContent.match(/(?:\/\/ (\d{8}-\d{4}) \/\/ [^\n]*Qualified Subject)/);
    if (!qualifiedMatch) {
      throw new Error("Could not find qualified-sender message timestamp in mailbox");
    }
    const qualifiedTimestamp = qualifiedMatch[1];

    const result = archiveMessage(
      "TESTPROJ",
      "RECIPIENT",
      "TESTPROJ/SENDER",
      qualifiedTimestamp,
      "Qualified Subject",
      "TESTPROJ"
    );

    expect(result.status).toBe("archived");
    expect(result.archived_message.subject).toBe("Qualified Subject");
  });

  test("regression: archive a multiline-body message (parseMessage throws on body lines)", () => {
    // beforeEach already initialized mailboxes + wrote a single-line message.
    // We just append a 2nd message with a 3-line body. Before the fix,
    // updateMessageInPath iterated over raw lines and called parseMessage()
    // which throws on body lines.
    writeMail(
      "TESTPROJ",
      "SENDER",
      "RECIPIENT",
      "M",
      "Multi Subject",
      "Ligne 1\nLigne 2\nLigne 3"
    );

    // Find the timestamp of the multiline message (not the single-line one)
    const inboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    const multiMatch = inboxContent.match(/(?:\/\/ (\d{8}-\d{4}) \/\/ [^\n]*Multi Subject)/);
    if (!multiMatch) {
      throw new Error("Could not find multiline message timestamp in mailbox");
    }
    const multiTimestamp = multiMatch[1];

    const result = archiveMessage(
      "TESTPROJ",
      "RECIPIENT",
      "SENDER",
      multiTimestamp,
      "Multi Subject"
    );

    expect(result.status).toBe("archived");
    expect(result.archived_message).toBeDefined();
    expect(result.archived_message.subject).toBe("Multi Subject");
    expect(result.archived_message.body).toBe("Ligne 1\nLigne 2\nLigne 3");

    // The mailbox should still contain the single-line message, plus the
    // sentinel. The multiline one must be gone.
    const inbox = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf8");
    expect(inbox).toContain("Test Subject");
    expect(inbox).not.toContain("Multi Subject");
    expect(inbox).not.toContain("Ligne 2");

    // The archive file should contain the full multiline message
    const archive = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT_archive.md"), "utf8");
    expect(archive).toContain("Multi Subject");
    expect(archive).toContain("Ligne 1");
    expect(archive).toContain("Ligne 2");
    expect(archive).toContain("Ligne 3");
  });
});
