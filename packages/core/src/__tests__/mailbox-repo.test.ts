import { readMessages, readMessagesFromPath, writeMessage, initMailbox } from "../repositories/mailbox-repo";
import fs from "fs";
import os from "os";
import path from "path";

describe("mailbox-repo", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "mailbox-repo-test-"));
  let mailboxFile: string;
  let archiveFile: string;
  let outboxFile: string;
  let handle: string;

  beforeEach(() => {
    handle = `AGENT_${Date.now()}`;
    mailboxFile = path.join(projectPath, `mailbox_${handle}.md`);
    archiveFile = path.join(projectPath, `mailbox_${handle}_archive.md`);
    outboxFile = path.join(projectPath, `outbox_${handle}.md`);
  });

  afterEach(() => {
    [mailboxFile, archiveFile, outboxFile].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  describe("readMessages", () => {
    it("should return parsed messages", () => {
      fs.writeFileSync(mailboxFile, "AGENT1 // 20260325-1816 // H // Test Subject // Test Body\n<!-- END -->");
      const messages = readMessages(projectPath, handle);
      expect(messages).toHaveLength(1);
      expect(messages[0].sender).toBe("AGENT1");
    });

    it("should return empty array if no messages", () => {
      fs.writeFileSync(mailboxFile, "<!-- END -->");
      const messages = readMessages(projectPath, handle);
      expect(messages).toHaveLength(0);
    });

    it("should throw error if mailbox does not exist", () => {
      expect(() => readMessages(projectPath, handle)).toThrow();
    });

    it("round-trips a body containing ' // ' through write + read (no phantom)", () => {
      fs.writeFileSync(mailboxFile, "<!-- END -->");
      writeMessage(projectPath, handle, {
        sender: "AGENT1",
        timestamp: "20260325-1816",
        priority: "M",
        subject: "Subject",
        body: "a // b // c // d",
      });
      const messages = readMessages(projectPath, handle);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe("a // b // c // d");
    });

    it("round-trips a multi-line body with ' // ' without spawning a phantom (D3)", () => {
      fs.writeFileSync(mailboxFile, "<!-- END -->");
      writeMessage(projectPath, handle, {
        sender: "AGENT1",
        timestamp: "20260325-1816",
        priority: "M",
        subject: "Subject",
        body: "first\n20261013-0004 // A -> B // 3 // note",
      });
      const messages = readMessages(projectPath, handle);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe("first\n20261013-0004 // A -> B // 3 // note");
    });
  });


  describe("writeMessage", () => {
    it("should write a message to the mailbox", () => {
      fs.writeFileSync(mailboxFile, "<!-- END -->");
      writeMessage(projectPath, handle, {
        sender: "AGENT1",
        timestamp: "20260325-1816",
        priority: "H",
        subject: "Test Subject",
        body: "Test Body",
      });
      const content = fs.readFileSync(mailboxFile, "utf-8");
      expect(content).toContain("AGENT1");
    });

    it("should throw error if mailbox does not exist", () => {
      expect(() =>
        writeMessage(projectPath, handle, {
          sender: "AGENT1",
          timestamp: "20260325-1816",
          priority: "H",
          subject: "Test Subject",
          body: "Test Body",
        })
      ).toThrow();
    });
  });



  describe("initMailbox", () => {
    it("should create mailbox, archive, and outbox files", () => {
      initMailbox(projectPath, handle);
      expect(fs.existsSync(mailboxFile)).toBe(true);
      expect(fs.existsSync(archiveFile)).toBe(true);
      expect(fs.existsSync(outboxFile)).toBe(true);
    });

    it("should not overwrite existing files", () => {
      fs.writeFileSync(mailboxFile, "existing content\n<!-- END -->");
      initMailbox(projectPath, handle);
      const content = fs.readFileSync(mailboxFile, "utf-8");
      expect(content).toContain("existing content");
    });
  });
});

// V2.5 SIMPLIFY WS4 — regression tests for the double-read elimination.
// V2.5 SIMPLIFY WS4 — Finding #4+#5: ensureSentinel returns the file
// content; downstream callers (parseMailboxStateFromPath, writeMessageToPath)
// must reuse the returned content instead of issuing a second readFileSync.

describe("WS4 double-read elimination", () => {
  let localProjectPath: string;
  let localMailboxFile: string;

  beforeEach(() => {
    localProjectPath = fs.mkdtempSync(path.join(os.tmpdir(), "ws4-mailbox-repo-"));
    localMailboxFile = path.join(localProjectPath, `mailbox_WS4.md`);
  });

  afterEach(() => {
    if (fs.existsSync(localMailboxFile)) {
      fs.unlinkSync(localMailboxFile);
    }
    fs.rmSync(localProjectPath, { recursive: true, force: true });
  });

  it("readMessages triggers at most one readFileSync per call", () => {
    fs.writeFileSync(localMailboxFile, "AGENT1 // 20260325-1816 // H // S // B\n<!-- END -->");
    const spy = jest.spyOn(fs, "readFileSync");
    try {
      readMessagesFromPath(localMailboxFile);
      // parseMailboxStateFromPath -> ensureSentinel (1 read) + parse:
      //   the second `fs.readFileSync` line was removed in WS4.
      // Acceptable count: 1 read (ensureSentinel only) + test setup overhead.
      const mailboxReads = spy.mock.calls.filter(
        call => typeof call[0] === "string" && (call[0] as string) === localMailboxFile
      );
      expect(mailboxReads.length).toBeLessThanOrEqual(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("writeMessageToPath uses content from ensureSentinel (no extra read for insert)", () => {
    fs.writeFileSync(localMailboxFile, "<!-- END -->");
    const spy = jest.spyOn(fs, "readFileSync");
    try {
      writeMessage(localProjectPath, "WS4", {
        sender: "AGENT1",
        timestamp: "20260325-1900",
        priority: "M",
        subject: "WS4",
        body: "Body",
      });
      // Exactly 1 read in ensureSentinel; insertBeforeSentinel receives
      // `knownContent` and does NOT re-read.
      const mailboxReads = spy.mock.calls.filter(
        call => typeof call[0] === "string" && (call[0] as string) === localMailboxFile
      );
      expect(mailboxReads.length).toBeLessThanOrEqual(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("initMailbox uses resetFileWithSentinel (mirrors SENTINEL constant)", () => {
    // Use a fresh tempdir with no pre-existing files
    const sentProbe = fs.mkdtempSync(path.join(os.tmpdir(), "ws4-init-"));
    const probeMailbox = path.join(sentProbe, "mailbox_PROBE.md");
    initMailbox(sentProbe, "PROBE");
    const content = fs.readFileSync(probeMailbox, "utf-8");
    // resetFileWithSentinel writes `${SENTINEL}\n` which equals `<!-- END -->\n`.
    // The test asserts the canonical sentinel is present (constant-aliased).
    expect(content).toContain("<!-- END -->");
    fs.rmSync(sentProbe, { recursive: true, force: true });
  });
});
