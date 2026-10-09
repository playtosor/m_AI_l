import { mailboxWithLib } from "../tools/mailbox-core";
import type { MailboxInput } from "../tools/mailbox-core";
import { ProjectNotFoundError } from "../domain/errors";

// ---------------------------------------------------------------------------
// Mock lib factory
// ---------------------------------------------------------------------------

function createMockLib() {
  return {
    readMail: jest.fn(),
    writeMail: jest.fn(),
    upsertHandle: jest.fn(),
    getRoster: jest.fn(),
    getProjects: jest.fn(),
  };
}

type MockLib = ReturnType<typeof createMockLib>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callWith(lib: MockLib, input: MailboxInput) {
  return mailboxWithLib(lib, input);
}

const ROSTER = [
  { handle: "AGENT1", role: "Dev", mailbox: "mailbox_AGENT1.md", status: "active" },
  { handle: "AGENT2", role: "Dev", mailbox: "mailbox_AGENT2.md", status: "active" },
  { handle: "HUMAN", role: "User", mailbox: "C:\\dev\\common\\mailbox_HUMAN.md", status: "active" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mailbox tool", () => {
  describe("MAIL!", () => {
    it("1. should return formatted messages", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.readMail.mockReturnValue({
        messages: [
          {
            sender: "AGENT2",
            timestamp: "20260512-1015",
            priority: "H",
            subject: "Test subject",
            body: "Message body",
          },
        ],
        invalid_lines: [],
        warning_count: 0,
      });

      const result = callWith(lib, { action: "mail", project_handle: "TEST", handle: "AGENT1" });

      expect(result).toEqual({
        success: true,
        output:
          "=== Mailbox for AGENT1 in TEST ===\n" +
          "[20260512-1015] AGENT2 (H) Test subject\nMessage body" +
          " (invalid_lines: 0, warning_count: 0)",
      });
      expect(lib.readMail).toHaveBeenCalledWith("TEST", "AGENT1", { roster: ROSTER });
    });

    it("1b. should forward limit and no_archive to readMail", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.readMail.mockReturnValue({ messages: [], invalid_lines: [], warning_count: 0 });

      callWith(lib, { action: "mail", project_handle: "TEST", handle: "AGENT1", no_archive: true, limit: 3 });

      expect(lib.readMail).toHaveBeenCalledWith("TEST", "AGENT1", { noArchive: true, limit: 3, roster: ROSTER });
    });

    it("2. should return 'no messages' when empty", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.readMail.mockReturnValue({ messages: [], invalid_lines: [], warning_count: 0 });

      const result = callWith(lib, { action: "mail", project_handle: "TEST", handle: "AGENT1" });

      expect(result).toEqual({
        success: true,
        output: "No messages in TEST (AGENT1).",
      });
    });

    it("3. should fail if handle is unknown", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);

      const result = callWith(lib, { action: "mail", project_handle: "TEST", handle: "UNKNOWN" });

      expect(result).toEqual({
        success: false,
        error: "Unknown handle: UNKNOWN in TEST. Known handles: AGENT1, AGENT2, HUMAN",
      });
      expect(lib.readMail).not.toHaveBeenCalled();
    });

    it("4. should fail if project not found", () => {
      const lib = createMockLib();
      const err = new ProjectNotFoundError("INEXISTANT");
      lib.getRoster.mockImplementation(() => {
        throw err;
      });
      lib.getProjects.mockReturnValue([
        { name: "PROJ1", path: "C:\\dev\\proj1" },
        { name: "PROJ2", path: "C:\\dev\\proj2" },
        { name: "COMMON", path: "C:\\dev\\common" },
      ]);

      const result = callWith(lib, { action: "mail", project_handle: "INEXISTANT", handle: "AGENT1" });

      expect(result).toEqual({
        success: false,
        error: "Project not found: INEXISTANT. Available projects: PROJ1, PROJ2, COMMON",
      });
    });

    it("4a. should accept qualified-form handle PROJ/HANDLE", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.readMail.mockReturnValue({ messages: [], invalid_lines: [], warning_count: 0 });

      const result = callWith(lib, { action: "mail", project_handle: "TEST", handle: "TEST/AGENT1" });

      expect(result).toEqual({
        success: true,
        output: "No messages in TEST (TEST/AGENT1).",
      });
      expect(lib.readMail).toHaveBeenCalledWith("TEST", "AGENT1", { roster: ROSTER });
    });
  });

  describe("SEND!", () => {
    it("5. should send with known sender and known recipient", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.writeMail.mockReturnValue("AGENT1");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "AGENT1",
        recipient: "AGENT2",
        subject: "Hello",
        body: "How are you?",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to AGENT2 in TEST.",
      });
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "AGENT1", "AGENT2", "M", "Hello", "How are you?", undefined, undefined, ROSTER);
    });

    it("6. should use TRANSIENT when sender is absent", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.writeMail.mockReturnValue("TRANSIENT");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        recipient: "AGENT2",
        subject: "Anonymous",
        body: "Message",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to AGENT2 in TEST. Warning: sender absent, TRANSIENT used.",
      });
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "TRANSIENT", "AGENT2", "M", "Anonymous", "Message", undefined, undefined, ROSTER);
    });

    it("7. should send with warning if sender not in roster", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.writeMail.mockReturnValue("UNKNOWN");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "UNKNOWN",
        recipient: "AGENT2",
        subject: "Hi",
        body: "From outside",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to AGENT2 in TEST. Warning: sender UNKNOWN not registered in this project, message delivered without outbox.",
      });
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "UNKNOWN", "AGENT2", "M", "Hi", "From outside", undefined, undefined, ROSTER);
    });

    it("8. should fail if recipient is unknown", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "AGENT1",
        recipient: "UNKNOWN",
        subject: "Hello",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Unknown recipient: UNKNOWN in TEST. Known handles: AGENT1, AGENT2, HUMAN",
      });
      expect(lib.writeMail).not.toHaveBeenCalled();
    });

    it("9. should fail if project not found", () => {
      const lib = createMockLib();
      const err = new ProjectNotFoundError("FAKE");
      lib.getRoster.mockImplementation(() => {
        throw err;
      });
      lib.getProjects.mockReturnValue([
        { name: "PROJ1", path: "C:\\dev\\proj1" },
        { name: "COMMON", path: "C:\\dev\\common" },
      ]);

      const result = callWith(lib, {
        action: "send",
        project_handle: "FAKE",
        sender: "AGENT1",
        recipient: "AGENT2",
        subject: "Test",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Project not found: FAKE. Available projects: PROJ1, COMMON",
      });
    });

    it("9a. should accept qualified-form recipient PROJ/HANDLE", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.writeMail.mockReturnValue("AGENT1");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "AGENT1",
        recipient: "TEST/AGENT2",
        subject: "Hello",
        body: "How are you?",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to TEST/AGENT2 in TEST.",
      });
      // writeMail must receive the BARE handle so it can look the entry up
      // in the project's roster, not the qualified string.
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "AGENT1", "AGENT2", "M", "Hello", "How are you?", undefined, undefined, ROSTER);
    });

    it("9b. should reject qualified recipient whose bare handle is not in roster", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "AGENT1",
        recipient: "TEST/UNKNOWN",
        subject: "Hi",
        body: "Body",
      });

      expect(result).toEqual({
        success: false,
        error: "Unknown recipient: TEST/UNKNOWN in TEST. Known handles: AGENT1, AGENT2, HUMAN",
      });
      expect(lib.writeMail).not.toHaveBeenCalled();
    });

    it("9c. should accept qualified-form sender PROJ/HANDLE without warning", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      // Same-project qualified sender is normalized to the bare handle at
      // write time (resolveEffectiveSender strips the project prefix).
      lib.writeMail.mockReturnValue("AGENT1");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "TEST/AGENT1",
        recipient: "AGENT2",
        subject: "Hi",
        body: "Body",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to AGENT2 in TEST.",
      });
      // senderProjectHandle is forwarded to writeMail so the message can
      // be normalized to the bare handle when the origin matches.
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "TEST/AGENT1", "AGENT2", "M", "Hi", "Body", undefined, "TEST", ROSTER);
    });

    it("9d. should warn when qualified sender's bare handle is not in this roster", () => {
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.writeMail.mockReturnValue("OTHER/UNKNOWN");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "OTHER/UNKNOWN",
        recipient: "AGENT2",
        subject: "Hi",
        body: "Cross-project",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to AGENT2 in TEST. Warning: sender OTHER/UNKNOWN not registered in this project, message delivered without outbox.",
      });
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "OTHER/UNKNOWN", "AGENT2", "M", "Hi", "Cross-project", undefined, "OTHER", ROSTER);
    });

    it("9e. should accept cross-project qualified sender when bare handle is in this roster", () => {
      // Mirror of 9c but with a different project prefix: the bare handle
      // AGENT1 IS in TEST's roster, so no warning; the prefix is forwarded
      // as senderProjectHandle so writeMail can stamp the qualified label
      // once (no double qualification when the sender already carries it).
      const lib = createMockLib();
      lib.getRoster.mockReturnValue(ROSTER);
      lib.writeMail.mockReturnValue("OTHER/AGENT1");

      const result = callWith(lib, {
        action: "send",
        project_handle: "TEST",
        sender: "OTHER/AGENT1",
        recipient: "AGENT2",
        subject: "Hi",
        body: "Cross-project",
      });

      expect(result).toEqual({
        success: true,
        output: "Sent to AGENT2 in TEST.",
      });
      expect(lib.writeMail).toHaveBeenCalledWith("TEST", "OTHER/AGENT1", "AGENT2", "M", "Hi", "Cross-project", undefined, "OTHER", ROSTER);
    });
  });

  describe("REGISTER", () => {
    it("10. should create a new handle", () => {
      const lib = createMockLib();
      lib.upsertHandle.mockReturnValue({
        status: "created",
        project_handle: "TEST",
        handle: "NEW_AGENT",
        role: "Dev",
        mailbox: "mailbox_NEW_AGENT.md",
        roster_status: "active",
      });

      const result = callWith(lib, {
        action: "register",
        project_handle: "TEST",
        handle: "NEW_AGENT",
        role: "Dev",
      });

      expect(result).toEqual({
        success: true,
        output: "Handle NEW_AGENT created in TEST (role: Dev, mailbox: mailbox_NEW_AGENT.md).",
      });
      expect(lib.upsertHandle).toHaveBeenCalledWith({
        project_handle: "TEST",
        handle: "NEW_AGENT",
        role: "Dev",
        mailbox: undefined,
        status: undefined,
      });
    });

    it("11. should update an existing handle", () => {
      const lib = createMockLib();
      lib.upsertHandle.mockReturnValue({
        status: "updated",
        project_handle: "TEST",
        handle: "AGENT1",
        role: "Senior Dev",
        mailbox: "mailbox_AGENT1.md",
        roster_status: "active",
      });

      const result = callWith(lib, {
        action: "register",
        project_handle: "TEST",
        handle: "AGENT1",
        role: "Senior Dev",
      });

      expect(result).toEqual({
        success: true,
        output: "Handle AGENT1 updated in TEST (role: Senior Dev, mailbox: mailbox_AGENT1.md).",
      });
    });

    it("12. should fail if role is missing", () => {
      const lib = createMockLib();
      const result = callWith(lib, {
        action: "register",
        project_handle: "TEST",
        handle: "NEW_AGENT",
      } as MailboxInput);

      expect(result).toEqual({
        success: false,
        error: "Missing required field: role",
      });
    });

    it("13. should fail if project is invalid", () => {
      const lib = createMockLib();
      const err = new ProjectNotFoundError("FAKE");
      lib.upsertHandle.mockImplementation(() => {
        throw err;
      });
      lib.getProjects.mockReturnValue([
        { name: "PROJ1", path: "C:\\dev\\proj1" },
      ]);

      const result = callWith(lib, {
        action: "register",
        project_handle: "FAKE",
        handle: "NEW_AGENT",
        role: "Dev",
      });

      expect(result).toEqual({
        success: false,
        error: "Project not found: FAKE. Available projects: PROJ1",
      });
    });
  });
});
