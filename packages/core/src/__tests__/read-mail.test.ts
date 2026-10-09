import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-mail-test-"));
const rosterFile = path.join(tempDir, "roster.md");
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-mail-common-test-"));
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-mail-external-test-"));

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: commonDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
  HUMAN_HANDLE: "HUMAN",
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TEST",
    path: tempDir,
    roster: rosterFile,
    status: "active",
  }),
  getProjects: () => [
    {
      name: "TEST",
      path: tempDir,
      roster: rosterFile,
      status: "active",
    },
    {
      name: "EXTERNAL",
      path: externalDir,
      status: "active",
    },
  ],
}));

jest.mock("../lib/paths", () => {
  const actual = jest.requireActual("../lib/paths");
  return {
    ...actual,
    getProjectsPath: () => path.join(commonDir, "projects_config.md"),
  };
});

import { archiveMail } from "../services/archive-mail";
import { readMail } from "../services/read-mail";
import { HUMAN_HANDLE } from "../domain/constants";

describe("read-mail services", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(commonDir)) {
      fs.rmSync(path.join(commonDir, entry), { recursive: true, force: true });
    }
  });

  it("should read and archive the HUMAN mailbox stored next to projects_config.md", () => {
    const humanMailbox = path.join(commonDir, "mailbox_HUMAN.md");
    const humanArchive = path.join(commonDir, "mailbox_HUMAN_archive.md");

    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| HUMAN | User | ${humanMailbox} | active |\n`
    );
    fs.writeFileSync(humanMailbox, "AGENT1 // 20260404-1010 // H // Hello // Hi\n<!-- END -->\n");

    const snapshot = readMail("TEST", HUMAN_HANDLE);

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("Hello");
    expect(snapshot.invalid_lines).toHaveLength(0);
    expect(snapshot.warning_count).toBe(0);
    expect(fs.readFileSync(humanMailbox, "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(humanArchive, "utf-8")).toContain(
      "AGENT1 // 20260404-1010 // H // Hello // Hi"
    );
  });

  it("should read the oldest message from an external mailbox path declared in the roster", () => {
    const externalMailbox = path.join(externalDir, "mailbox_SHARED.md");
    const externalArchive = path.join(externalDir, "mailbox_SHARED_archive.md");

    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| SHARED | Shared Agent | ${externalMailbox} | active |\n`
    );
    fs.writeFileSync(
      externalMailbox,
      "AGENT1 // 20260404-1010 // H // First // One\n" +
        "AGENT2 // 20260404-1011 // M // Second // Two\n" +
        "<!-- END -->\n"
    );
    fs.writeFileSync(externalArchive, "<!-- END -->\n");

    const snapshot = readMail("TEST", "SHARED", { limit: 1 });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("First");
    expect(snapshot.invalid_lines).toHaveLength(0);
    expect(snapshot.warning_count).toBe(0);
    expect(fs.readFileSync(externalMailbox, "utf-8")).toContain(
      "AGENT2 // 20260404-1011 // M // Second // Two"
    );
    expect(fs.readFileSync(externalArchive, "utf-8")).toContain(
      "AGENT1 // 20260404-1010 // H // First // One"
    );
  });

  it("should support mailbox_override for exceptional reads and archives", () => {
    const rescueDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-mail-override-test-"));
    const rescueMailbox = path.join(rescueDir, "mailbox_RESCUE.md");
    const rescueArchive = path.join(rescueDir, "mailbox_RESCUE_archive.md");

    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Agent | mailbox_AGENT1.md | active |\n"
    );
    fs.writeFileSync(
      rescueMailbox,
      "AGENT9 // 20260404-1020 // H // Rescue // Use override\n<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "AGENT1", {
      noArchive: true,
      mailboxOverride: rescueMailbox,
    });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("Rescue");
    expect(snapshot.invalid_lines).toHaveLength(0);
    expect(snapshot.warning_count).toBe(0);

    archiveMail("TEST", "AGENT1", rescueMailbox);

    expect(fs.readFileSync(rescueMailbox, "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(rescueArchive, "utf-8")).toContain(
      "AGENT9 // 20260404-1020 // H // Rescue // Use override"
    );
  });

  it("should read a message with an imperfect timestamp and report a warning instead of blocking", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Agent | mailbox_AGENT1.md | active |\n"
    );
    fs.writeFileSync(
      path.join(tempDir, "mailbox_AGENT1.md"),
      "SENDER // HHMM // H // Broken // Bad timestamp\n" +
        "SENDER // 20260405-1015 // M // Good // Read me\n" +
        "<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "AGENT1");

    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0].subject).toBe("Broken");
    expect(snapshot.messages[1].subject).toBe("Good");
    expect(snapshot.invalid_lines).toHaveLength(0);
    expect(snapshot.warning_count).toBe(1);
    expect(fs.readFileSync(path.join(tempDir, "mailbox_AGENT1.md"), "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(path.join(tempDir, "mailbox_AGENT1_archive.md"), "utf-8")).toContain(
      "SENDER // HHMM // H // Broken // Bad timestamp"
    );
    expect(fs.readFileSync(path.join(tempDir, "mailbox_AGENT1_archive.md"), "utf-8")).toContain(
      "SENDER // 20260405-1015 // M // Good // Read me"
    );
  });

  it("should accept a missing priority with a warning and archive the message", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT2 | Agent | mailbox_AGENT2.md | active |\n"
    );
    fs.writeFileSync(
      path.join(tempDir, "mailbox_AGENT2.md"),
      "SENDER // 20260405-1016 // First valid // Hello without explicit priority\n" +
        "<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "AGENT2", { limit: 1 });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("First valid");
    expect(snapshot.messages[0].priority).toBe("M");
    expect(snapshot.invalid_lines).toHaveLength(0);
    expect(snapshot.warning_count).toBe(1);
    expect(fs.readFileSync(path.join(tempDir, "mailbox_AGENT2.md"), "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(path.join(tempDir, "mailbox_AGENT2_archive.md"), "utf-8")).toContain(
      "SENDER // 20260405-1016 // First valid // Hello without explicit priority"
    );
  });

  it("should preserve a multi-line handover body as a single message", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| TST | Agent | mailbox_TST.md | active |\n"
    );
    fs.writeFileSync(
      path.join(tempDir, "mailbox_TST.md"),
      "TST // 20260404-2200 // H // Handover //\n" +
        "Current task: Investigate bug\n" +
        "Next steps:\n" +
        "1. Reproduce\n" +
        "2. Fix\n" +
        "<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "TST", { noArchive: true });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("Handover");
    expect(snapshot.messages[0].body).toContain("Current task: Investigate bug");
    expect(snapshot.messages[0].body).toContain("Next steps:");
    expect(snapshot.messages[0].body).toContain("2. Fix");
    expect(snapshot.invalid_lines).toHaveLength(0);
    expect(snapshot.warning_count).toBe(0);
  });

  it("should read and archive only N messages when limit is specified", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Agent | mailbox_AGENT1.md | active |\n"
    );
    fs.writeFileSync(
      path.join(tempDir, "mailbox_AGENT1.md"),
      "AGENT1 // 20260405-1001 // H // First // One\n" +
        "AGENT2 // 20260405-1002 // M // Second // Two\n" +
        "AGENT3 // 20260405-1003 // L // Third // Three\n" +
        "<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "AGENT1", { limit: 2 });

    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0].subject).toBe("First");
    expect(snapshot.messages[1].subject).toBe("Second");
    expect(snapshot.invalid_lines).toHaveLength(0);

    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_AGENT1.md"), "utf-8");
    expect(mailboxContent).toContain("AGENT3 // 20260405-1003 // L // Third // Three");
    expect(mailboxContent).not.toContain("AGENT1 // 20260405-1001");

    const archiveContent = fs.readFileSync(
      path.join(tempDir, "mailbox_AGENT1_archive.md"),
      "utf-8"
    );
    expect(archiveContent).toContain("AGENT1 // 20260405-1001 // H // First // One");
    expect(archiveContent).toContain("AGENT2 // 20260405-1002 // M // Second // Two");
    expect(archiveContent).not.toContain("AGENT3 // 20260405-1003");
  });

  it("should handle limit greater than message count gracefully", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Agent | mailbox_AGENT1.md | active |\n"
    );
    fs.writeFileSync(
      path.join(tempDir, "mailbox_AGENT1.md"),
      "AGENT1 // 20260405-1001 // H // Only // One message\n" + "<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "AGENT1", { limit: 5 });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("Only");
    expect(fs.readFileSync(path.join(tempDir, "mailbox_AGENT1.md"), "utf-8")).toBe("<!-- END -->\n");
  });

  it("should read without archiving when noArchive is true with limit", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Agent | mailbox_AGENT1.md | active |\n"
    );
    fs.writeFileSync(
      path.join(tempDir, "mailbox_AGENT1.md"),
      "AGENT1 // 20260405-1001 // H // First // One\n" +
        "AGENT2 // 20260405-1002 // M // Second // Two\n" +
        "<!-- END -->\n"
    );

    const snapshot = readMail("TEST", "AGENT1", { limit: 1, noArchive: true });

    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].subject).toBe("First");

    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_AGENT1.md"), "utf-8");
    expect(mailboxContent).toContain("AGENT1 // 20260405-1001");
    expect(mailboxContent).toContain("AGENT2 // 20260405-1002");
  });
});
