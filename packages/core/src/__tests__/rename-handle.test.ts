import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-handle-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-handle-common-test-"));
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

import { renameHandle } from "../services/rename-handle";

const ROSTER_HEADER = "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n";

function writeRoster(entries: Array<{ handle: string; role: string; mailbox: string; status: string }>): void {
  const body = entries.map(e => `| ${e.handle} | ${e.role} | ${e.mailbox} | ${e.status} |`).join("\n");
  fs.writeFileSync(rosterFile, ROSTER_HEADER + body + "\n");
}

function readRoster(): string {
  return fs.readFileSync(rosterFile, "utf-8");
}

describe("renameHandle service", () => {
  let oldMailbox: string;
  let oldArchive: string;
  let oldOutbox: string;
  let newMailbox: string;
  let newArchive: string;
  let newOutbox: string;

  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      if (entry === "roster.md") continue;
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    writeRoster([
      { handle: "ALPHA", role: "Lead", mailbox: "mailbox_ALPHA.md", status: "active" },
      { handle: "BETA", role: "Worker", mailbox: "mailbox_BETA.md", status: "active" },
      { handle: "DELTA", role: "Other", mailbox: "mailbox_DELTA.md", status: "active" },
    ]);

    oldMailbox = path.join(tempDir, "mailbox_BETA.md");
    oldArchive = path.join(tempDir, "mailbox_BETA_archive.md");
    oldOutbox = path.join(tempDir, "outbox_BETA.md");
    newMailbox = path.join(tempDir, "mailbox_GAMMA.md");
    newArchive = path.join(tempDir, "mailbox_GAMMA_archive.md");
    newOutbox = path.join(tempDir, "outbox_GAMMA.md");
  });

  it("moves the 3 files, updates the roster, and removes the old files", () => {
    const mailboxContent = "B // 20260101-0900 // H // Hello // body\n<!-- END -->\n";
    const archiveContent = "X // 20260101-0800 // M // Past // body\n<!-- END -->\n";
    const outboxContent = "20260101-0700 // RECIPIENT // SUBJECT\n<!-- END -->\n";
    fs.writeFileSync(oldMailbox, mailboxContent);
    fs.writeFileSync(oldArchive, archiveContent);
    fs.writeFileSync(oldOutbox, outboxContent);

    const result = renameHandle({
      project_handle: "TEST",
      old_handle: "BETA",
      new_handle: "GAMMA",
    });

    expect(result).toEqual({
      status: "renamed",
      project_handle: "TEST",
      old_handle: "BETA",
      new_handle: "GAMMA",
    });
    expect(fs.readFileSync(newMailbox, "utf-8")).toBe(mailboxContent);
    expect(fs.readFileSync(newArchive, "utf-8")).toBe(archiveContent);
    expect(fs.readFileSync(newOutbox, "utf-8")).toBe(outboxContent);
    expect(fs.existsSync(oldMailbox)).toBe(false);
    expect(fs.existsSync(oldArchive)).toBe(false);
    expect(fs.existsSync(oldOutbox)).toBe(false);

    const roster = readRoster();
    expect(roster).toContain("| GAMMA | Worker | mailbox_GAMMA.md | active |");
    expect(roster).not.toContain("BETA");
    expect(roster).toContain("ALPHA");
    expect(roster).toContain("DELTA");
  });

  it("creates empty new files when old files did not exist", () => {
    renameHandle({
      project_handle: "TEST",
      old_handle: "BETA",
      new_handle: "GAMMA",
    });

    expect(fs.readFileSync(newMailbox, "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(newArchive, "utf-8")).toBe("<!-- END -->\n");
    expect(fs.readFileSync(newOutbox, "utf-8")).toBe("<!-- END -->\n");
  });

  it("throws RosterEntryNotFoundError when old_handle is missing", () => {
    expect(() =>
      renameHandle({ project_handle: "TEST", old_handle: "MISSING", new_handle: "GAMMA" })
    ).toThrow(/Roster entry for handle MISSING not found/);
    expect(readRoster()).toContain("BETA");
    expect(fs.existsSync(newMailbox)).toBe(false);
  });

  it("throws RosterEntryExistsError when new_handle is already taken", () => {
    // Pre-create BETA's mailbox so we can verify it's untouched after the abort.
    fs.writeFileSync(oldMailbox, "<!-- END -->\n");
    expect(() =>
      renameHandle({ project_handle: "TEST", old_handle: "BETA", new_handle: "DELTA" })
    ).toThrow(/Roster entry for handle DELTA already exists/);
    expect(readRoster()).toContain("BETA");
    expect(readRoster()).toContain("DELTA");
    expect(fs.existsSync(newMailbox)).toBe(false);
    expect(fs.existsSync(oldMailbox)).toBe(true);
  });

  it("rejects identical handles", () => {
    expect(() =>
      renameHandle({ project_handle: "TEST", old_handle: "BETA", new_handle: "BETA" })
    ).toThrow(/identical/);
  });

  it("transforms a relative non-default mailbox path in the roster entry", () => {
    // Use a relative non-default path so we exercise the regex-based path
    // transform branch (avoids validateAbsoluteMailboxPath rejecting the
    // temp directory).
    writeRoster([
      { handle: "ALPHA", role: "Lead", mailbox: "mailbox_ALPHA.md", status: "active" },
      {
        handle: "BETA",
        role: "Worker",
        mailbox: "custom_dir/mailbox_BETA.md",
        status: "active",
      },
    ]);
    fs.mkdirSync(path.join(tempDir, "custom_dir"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "custom_dir", "mailbox_BETA.md"), "<!-- END -->\n");

    renameHandle({
      project_handle: "TEST",
      old_handle: "BETA",
      new_handle: "GAMMA",
    });

    const roster = readRoster();
    expect(roster).toContain("| GAMMA | Worker | custom_dir/mailbox_GAMMA.md | active |");
    expect(roster).not.toContain("mailbox_BETA.md");
  });
});
