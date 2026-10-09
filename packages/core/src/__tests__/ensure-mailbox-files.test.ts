import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-mailbox-files-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-mailbox-files-common-test-"));
const rosterFile = path.join(tempDir, "roster.md");

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: commonDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TEST",
    path: tempDir,
    roster: rosterFile,
    status: "active",
  }),
}));

jest.mock("../lib/paths", () => {
  const actual = jest.requireActual("../lib/paths");
  return {
    ...actual,
    getProjectsPath: () => path.join(commonDir, "projects_config.md"),
  };
});

import { ensureMailboxFiles } from "../services/ensure-mailbox-files";

describe("ensureMailboxFiles service", () => {
  let mailboxFile: string;
  let archiveFile: string;
  let outboxFile: string;

  beforeAll(() => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT | Test agent | mailbox_AGENT.md | active |\n"
    );
  });

  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      if (entry === "roster.md") continue;
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    mailboxFile = path.join(tempDir, "mailbox_AGENT.md");
    archiveFile = path.join(tempDir, "mailbox_AGENT_archive.md");
    outboxFile = path.join(tempDir, "outbox_AGENT.md");
  });

  it("creates all three files when none exist", () => {
    const result = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });

    expect(result.created).toEqual(["mailbox", "archive", "outbox"]);
    expect(fs.existsSync(mailboxFile)).toBe(true);
    expect(fs.existsSync(archiveFile)).toBe(true);
    expect(fs.existsSync(outboxFile)).toBe(true);
    expect(fs.readFileSync(mailboxFile, "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(archiveFile, "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(outboxFile, "utf-8")).toBe("<!-- END -->\n");
  });

  it("creates only the missing files", () => {
    fs.writeFileSync(mailboxFile, "<!-- END -->\n");
    fs.writeFileSync(archiveFile, "<!-- END -->\n");

    const result = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });

    expect(result.created).toEqual(["outbox"]);
    expect(fs.existsSync(mailboxFile)).toBe(true);
    expect(fs.existsSync(archiveFile)).toBe(true);
    expect(fs.existsSync(outboxFile)).toBe(true);
  });

  it("returns an empty array when everything already exists", () => {
    fs.writeFileSync(mailboxFile, "<!-- END -->\n");
    fs.writeFileSync(archiveFile, "<!-- END -->\n");
    fs.writeFileSync(outboxFile, "<!-- END -->\n");

    const result = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });

    expect(result.created).toEqual([]);
  });

  it("does not overwrite existing content", () => {
    const existingMailbox = "PENDING // 20260101-0900 // H // Important // body\n<!-- END -->\n";
    const existingArchive = "ARCHIVED // 20260101-0800 // M // Past // body\n<!-- END -->\n";
    const existingOutbox = "20260101-0700 // RECIPIENT // SUBJECT\n";
    fs.writeFileSync(mailboxFile, existingMailbox);
    fs.writeFileSync(archiveFile, existingArchive);
    fs.writeFileSync(outboxFile, existingOutbox);

    const result = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });

    expect(result.created).toEqual([]);
    expect(fs.readFileSync(mailboxFile, "utf-8")).toBe(existingMailbox);
    expect(fs.readFileSync(archiveFile, "utf-8")).toBe(existingArchive);
    expect(fs.readFileSync(outboxFile, "utf-8")).toBe(existingOutbox);
  });

  it("is idempotent when called twice in a row", () => {
    const first = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });
    expect(first.created).toHaveLength(3);

    const second = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });
    expect(second.created).toEqual([]);
  });

  it("returns created labels in canonical order: mailbox, archive, outbox", () => {
    // No fixtures: all three should be created in that order.
    const result = ensureMailboxFiles({ project_handle: "TEST", handle: "AGENT" });
    expect(result.created).toEqual(["mailbox", "archive", "outbox"]);
  });
});
