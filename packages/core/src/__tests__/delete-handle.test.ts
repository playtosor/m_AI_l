import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "delete-handle-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "delete-handle-common-test-"));
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

import { deleteHandle } from "../services/delete-handle";

const ROSTER_HEADER = "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n";

function writeRoster(entries: Array<{ handle: string; role: string; mailbox: string; status: string }>): void {
  const body = entries.map(e => `| ${e.handle} | ${e.role} | ${e.mailbox} | ${e.status} |`).join("\n");
  fs.writeFileSync(rosterFile, ROSTER_HEADER + body + "\n");
}

function readRoster(): string {
  return fs.readFileSync(rosterFile, "utf-8");
}

describe("deleteHandle service", () => {
  let mailboxFile: string;
  let archiveFile: string;
  let outboxFile: string;

  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      if (entry === "roster.md") continue;
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    writeRoster([
      { handle: "ALPHA", role: "Lead", mailbox: "mailbox_ALPHA.md", status: "active" },
      { handle: "BETA", role: "Worker", mailbox: "mailbox_BETA.md", status: "active" },
      { handle: "GAMMA", role: "Worker", mailbox: "mailbox_GAMMA.md", status: "active" },
    ]);

    mailboxFile = path.join(tempDir, "mailbox_BETA.md");
    archiveFile = path.join(tempDir, "mailbox_BETA_archive.md");
    outboxFile = path.join(tempDir, "outbox_BETA.md");
  });

  it("removes the handle from the roster and deletes its 3 files", () => {
    fs.writeFileSync(mailboxFile, "<!-- END -->\n");
    fs.writeFileSync(archiveFile, "<!-- END -->\n");
    fs.writeFileSync(outboxFile, "<!-- END -->\n");

    const result = deleteHandle({ project_handle: "TEST", handle: "BETA" });

    expect(result).toEqual({ status: "deleted", project_handle: "TEST", handle: "BETA" });
    expect(readRoster()).toContain("ALPHA");
    expect(readRoster()).toContain("GAMMA");
    expect(readRoster()).not.toContain("BETA");
    expect(fs.existsSync(mailboxFile)).toBe(false);
    expect(fs.existsSync(archiveFile)).toBe(false);
    expect(fs.existsSync(outboxFile)).toBe(false);
  });

  it("tolerates missing mailbox/archive/outbox files (no error)", () => {
    const result = deleteHandle({ project_handle: "TEST", handle: "BETA" });

    expect(result.status).toBe("deleted");
    expect(readRoster()).not.toContain("BETA");
  });

  it("throws RosterEntryNotFoundError when the handle is not in the roster", () => {
    expect(() => deleteHandle({ project_handle: "TEST", handle: "NONEXISTENT" })).toThrow(
      /Roster entry for handle NONEXISTENT not found/
    );

    // Roster must be untouched after a rejected delete.
    const before = readRoster();
    expect(() => deleteHandle({ project_handle: "TEST", handle: "NONEXISTENT" })).toThrow();
    expect(readRoster()).toBe(before);
  });

  it("is idempotent: a second call on the same handle errors as not-found", () => {
    deleteHandle({ project_handle: "TEST", handle: "BETA" });

    expect(() => deleteHandle({ project_handle: "TEST", handle: "BETA" })).toThrow(
      /Roster entry for handle BETA not found/
    );
  });

  it("does not touch other members' files", () => {
    const alphaMailbox = path.join(tempDir, "mailbox_ALPHA.md");
    const gammaMailbox = path.join(tempDir, "mailbox_GAMMA.md");
    const alphaContent = "ALPHA_INTACT // 20260101-0000 // H // Marker // body\n<!-- END -->\n";
    const gammaContent = "GAMMA_INTACT // 20260101-0000 // H // Marker // body\n<!-- END -->\n";
    fs.writeFileSync(alphaMailbox, alphaContent);
    fs.writeFileSync(gammaMailbox, gammaContent);
    fs.writeFileSync(mailboxFile, "<!-- END -->\n");

    deleteHandle({ project_handle: "TEST", handle: "BETA" });

    expect(fs.readFileSync(alphaMailbox, "utf-8")).toBe(alphaContent);
    expect(fs.readFileSync(gammaMailbox, "utf-8")).toBe(gammaContent);
    expect(fs.existsSync(mailboxFile)).toBe(false);
  });
});
