import { cancelMail } from "../services/cancel-mail";
import { editMail } from "../services/edit-mail";
import { writeMail } from "../services/write-mail";
import { MessageNotFoundError, RosterEntryInactiveError } from "../domain/errors";
import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-editing-test-"));
const rosterFile = path.join(tempDir, "roster.md");

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TEST",
    path: tempDir,
    roster: rosterFile,
    status: "active",
  }),
}));

function writeMailbox(content: string) {
  fs.writeFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), content);
}

describe("mail editing", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }

    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    fs.writeFileSync(path.join(tempDir, "outbox_SENDER.md"), "<!-- END -->\n");
  });

  it("should cancel a matching unread message from the active inbox", () => {
    writeMailbox(
      "SENDER // 20260329-1015 // H // Subject // Body\n" +
      "<!-- END -->\n"
    );

    const removed = cancelMail("TEST", "SENDER", "RECIPIENT", "20260329-1015", "Subject");

    expect(removed).toEqual({
      sender: "SENDER",
      timestamp: "20260329-1015",
      priority: "H",
      subject: "Subject",
      body: "Body",
    });
    expect(fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8")).toBe("<!-- END -->\n");
  });

  it("should fail to cancel when the message is no longer in the active inbox", () => {
    writeMailbox("<!-- END -->\n");

    expect(() => cancelMail("TEST", "SENDER", "RECIPIENT", "20260329-1015", "Subject")).toThrow(MessageNotFoundError);
  });

  it("should edit a matching unread message in place", () => {
    writeMailbox(
      "SENDER // 20260329-1015 // H // Subject // Body\n" +
      "<!-- END -->\n"
    );

    const result = editMail("TEST", "SENDER", "RECIPIENT", "20260329-1015", "Subject", {
      priority: "L",
      subject: "Updated subject",
      body: "Updated body",
    });

    expect(result.mode).toBe("edited_in_place");
    expect(result.previous?.subject).toBe("Subject");
    expect(result.message).toEqual({
      sender: "SENDER",
      timestamp: "20260329-1015",
      priority: "L",
      subject: "Updated subject",
      body: "Updated body",
    });

    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("SENDER // 20260329-1015 // L // Updated subject // Updated body");
  });

  it("should send a correction message when the original message is no longer active", () => {
    writeMailbox("<!-- END -->\n");

    const result = editMail("TEST", "SENDER", "RECIPIENT", "20260329-1015", "Subject", {
      body: "Replacement body with <!-- END --> marker",
    });

    expect(result.mode).toBe("correction_sent");
    expect(result.previous).toBeNull();
    expect(result.message.subject).toBe("CORRECTION: Subject");
    // #5: the correction carries the real timestamp stamped by writeMail,
    // not the fabricated "new" placeholder.
    expect(result.message.timestamp).toMatch(/^\d{8}-\d{4}$/);
    expect(result.message.body).toContain("Updated body: Replacement body with (((END))) marker");

    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("CORRECTION: Subject");
    expect(mailboxContent).toContain("Replacement body with (((END))) marker");
  });

  it("should refuse cancel and edit when the recipient roster entry is inactive", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | inactive |\n"
    );
    writeMailbox(
      "SENDER // 20260329-1015 // H // Subject // Body\n" +
      "<!-- END -->\n"
    );

    expect(() => cancelMail("TEST", "SENDER", "RECIPIENT", "20260329-1015", "Subject")).toThrow(RosterEntryInactiveError);
    expect(() =>
      editMail("TEST", "SENDER", "RECIPIENT", "20260329-1015", "Subject", {
        body: "Updated body",
      })
    ).toThrow(RosterEntryInactiveError);
  });

  it("should find and edit a message stored with PROJECT/HANDLE sender when sender_project_handle is provided", () => {
    writeMailbox(
      "MAILEXPORT/ARCHI // 20260422-1301 // M // Inter subject // Inter body\n" +
      "<!-- END -->\n"
    );
    const result = editMail("TEST", "ARCHI", "RECIPIENT", "20260422-1301", "Inter subject", {
      body: "Updated inter body",
    }, undefined, "MAILEXPORT");
    expect(result.mode).toBe("edited_in_place");
    expect(result.message?.body).toBe("Updated inter body");
    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("MAILEXPORT/ARCHI // 20260422-1301");
    expect(mailboxContent).toContain("Updated inter body");
  });

  it("round-trip: cancel a message sent with qualified same-project sender PROJ/HANDLE", () => {
    writeMailbox("<!-- END -->\n");
    writeMail("TEST", "TEST/SENDER", "RECIPIENT", "M", "Qualified cancel", "Body", undefined, "TEST");

    const content = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    const match = content.match(/\/\/ (\d{8}-\d{4}) \/\/ [^\n]*Qualified cancel/);
    if (!match) throw new Error("Could not find qualified-cancel timestamp");

    const removed = cancelMail("TEST", "TEST/SENDER", "RECIPIENT", match[1], "Qualified cancel", undefined, "TEST");
    expect(removed.sender).toBe("SENDER");
    expect(fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8")).toBe("<!-- END -->\n");
  });

  it("round-trip: edit a message sent with qualified same-project sender PROJ/HANDLE", () => {
    writeMailbox("<!-- END -->\n");
    writeMail("TEST", "TEST/SENDER", "RECIPIENT", "M", "Qualified edit", "Original body", undefined, "TEST");

    const content = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    const match = content.match(/\/\/ (\d{8}-\d{4}) \/\/ [^\n]*Qualified edit/);
    if (!match) throw new Error("Could not find qualified-edit timestamp");

    const result = editMail("TEST", "TEST/SENDER", "RECIPIENT", match[1], "Qualified edit", {
      body: "Updated body",
    }, undefined, "TEST");
    expect(result.mode).toBe("edited_in_place");
    expect(result.message?.body).toBe("Updated body");
  });
});
