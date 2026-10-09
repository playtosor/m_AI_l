import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-mail-test-"));
const rosterFile = path.join(tempDir, "roster.md");
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-mail-common-test-"));
const humanMailbox = path.join(commonDir, "mailbox_HUMAN.md");
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-mail-external-test-"));
const senderDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-mail-sender-external-test-"));

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
    {
      name: "SENDER",
      path: senderDir,
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

import { writeMail } from "../services/write-mail";
import { initMailbox } from "../repositories/mailbox-repo";
import { RosterEntryInactiveError, RosterEntryNotFoundError } from "../domain/errors";
import { HUMAN_HANDLE } from "../domain/constants";

describe("write-mail", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(commonDir)) {
      fs.rmSync(path.join(commonDir, entry), { recursive: true, force: true });
    }
  });

  it("should throw if the recipient is not present in the roster", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| SENDER | Sender Role | mailbox_SENDER.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    expect(() => writeMail("TEST", "SENDER", "RECIPIENT", "H", "Subject", "Body")).toThrow(
      RosterEntryNotFoundError
    );
  });

  it("should replace sentinel markers in the message body", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
        "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    initMailbox(tempDir, "RECIPIENT");
    writeMail("TEST", "SENDER", "RECIPIENT", "H", "Subject", "Body with <!-- END --> marker");
    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("Body with (((END))) marker");
    expect(mailboxContent).not.toContain("Body with <!-- END --> marker");
  });

  it("should throw if the recipient exists but is inactive", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | inactive |\n"
    );
    initMailbox(tempDir, "RECIPIENT");
    expect(() => writeMail("TEST", "SENDER", "RECIPIENT", "H", "Subject", "Body")).toThrow(
      RosterEntryInactiveError
    );
  });

  it("should deliver to HUMAN mailbox stored next to projects_config.md", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| HUMAN | User | " + humanMailbox + " | active |\n"
    );
    fs.writeFileSync(humanMailbox, "<!-- END -->\n");
    writeMail("TEST", "SENDER", HUMAN_HANDLE, "M", "Hello", "Hi HUMAN");
    const mailboxContent = fs.readFileSync(humanMailbox, "utf-8");
    expect(mailboxContent).toContain("SENDER //");
    expect(mailboxContent).toContain("Hi HUMAN");
  });

  it("should write to the mailbox path declared in the roster even when it points outside the project", () => {
    const externalMailbox = path.join(externalDir, "mailbox_TRANSVERSE.md");
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| TRANSVERSE | Shared Agent | ${externalMailbox} | active |\n`
    );
    fs.writeFileSync(externalMailbox, "<!-- END -->\n");
    writeMail("TEST", "SENDER", "TRANSVERSE", "L", "Ping", "Cross-project message");
    const mailboxContent = fs.readFileSync(externalMailbox, "utf-8");
    expect(mailboxContent).toContain("Cross-project message");
  });

  it("should store sender as HANDLE when sender_project_handle equals project_handle (intra-project)", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
      "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    initMailbox(tempDir, "RECIPIENT");
    const effectiveSender = writeMail("TEST", "ARCHI", "RECIPIENT", "M", "Intra", "Body", undefined, "TEST");
    expect(effectiveSender.effectiveSender).toBe("ARCHI");
    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("ARCHI //");
    expect(mailboxContent).not.toContain("TEST/ARCHI");
  });

  it("should store sender as PROJECT/HANDLE when sender_project_handle differs from project_handle (inter-project)", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
      "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    initMailbox(tempDir, "RECIPIENT");
    const effectiveSender = writeMail("TEST", "ARCHI", "RECIPIENT", "M", "Inter", "Body", undefined, "MAILEXPORT");
    expect(effectiveSender.effectiveSender).toBe("MAILEXPORT/ARCHI");
    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("MAILEXPORT/ARCHI //");
  });

  it("should store sender as HANDLE in legacy mode without sender_project_handle", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
      "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    initMailbox(tempDir, "RECIPIENT");
    const effectiveSender = writeMail("TEST", "ARCHI", "RECIPIENT", "M", "Legacy", "Body");
    expect(effectiveSender.effectiveSender).toBe("ARCHI");
    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf-8");
    expect(mailboxContent).toContain("ARCHI //");
    expect(mailboxContent).not.toContain("/ARCHI");
  });

  it("should log to the sender outbox derived from the sender mailbox location", () => {
    const senderMailbox = path.join(senderDir, "mailbox_SENDER.md");
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| SENDER | Sender Role | ${senderMailbox} | active |\n` +
        "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    fs.writeFileSync(senderMailbox, "<!-- END -->\n");
    fs.writeFileSync(path.join(senderDir, "outbox_SENDER.md"), "<!-- END -->\n");
    initMailbox(tempDir, "RECIPIENT");
    writeMail("TEST", "SENDER", "RECIPIENT", "H", "Subject", "Body");
    const outboxContent = fs.readFileSync(path.join(senderDir, "outbox_SENDER.md"), "utf-8");
    expect(outboxContent).toContain("RECIPIENT // Subject");
  });
});
