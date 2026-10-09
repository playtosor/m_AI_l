import path from "path";
import fs from "fs";
import os from "os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-delete-msg-"));
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

import { deleteMessage } from "../services/delete-message";
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

describe("delete message", () => {
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

    // V2.9: HUMAN cross-project handle must be in the roster (no more special case).
    ensureHumanInRoster(tempDir, rosterFile);
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

  test("should delete a single message", () => {
    const result = deleteMessage(
      "TESTPROJ",
      "RECIPIENT",
      "SENDER",
      testTimestamp,
      "Test Subject"
    );

    expect(result.status).toBe("deleted");
    expect(result.deleted_message).toBeDefined();
    expect(result.deleted_message.subject).toBe("Test Subject");
  });

  test("should throw error when message not found", () => {
    expect(() => {
      deleteMessage(
        "TESTPROJ",
        "RECIPIENT",
        "SENDER",
        "20990101-0000",
        "Non-existent"
      );
    }).toThrow();
  });

  test("round-trip: delete a message sent with qualified same-project sender PROJ/HANDLE", () => {
    writeMail(
      "TESTPROJ",
      "TESTPROJ/SENDER",
      "RECIPIENT",
      "M",
      "Qualified delete",
      "Body",
      undefined,
      "TESTPROJ"
    );

    const inboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    const match = inboxContent.match(/(?:\/\/ (\d{8}-\d{4}) \/\/ [^\n]*Qualified delete)/);
    if (!match) throw new Error("Could not find qualified-delete timestamp");

    const result = deleteMessage(
      "TESTPROJ",
      "RECIPIENT",
      "TESTPROJ/SENDER",
      match[1],
      "Qualified delete",
      "TESTPROJ"
    );

    expect(result.status).toBe("deleted");
    expect(result.deleted_message.sender).toBe("SENDER");
    expect(fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8")).not.toContain("Qualified delete");
  });
});
