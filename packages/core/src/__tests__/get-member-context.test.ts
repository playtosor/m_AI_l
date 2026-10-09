import fs from "fs";
import os from "os";
import path from "path";

// Capture HUMAN_HANDLE BEFORE jest.mock hoists — the mock factory below
// otherwise shadows the real constant for values resolved via domain/constants.
const { HUMAN_HANDLE } = jest.requireActual("../domain/constants") as typeof import("../domain/constants");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-member-context-test-"));
const rosterFile = path.join(tempDir, "roster.md");
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-member-context-common-test-"));
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-member-context-external-test-"));

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
    language: "French",
    status: "active",
  }),
  getProjects: () => [
    {
      name: "TEST",
      path: tempDir,
      roster: rosterFile,
      language: "French",
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

import { getMemberContextService } from "../services/get-member-context";
import { RosterEntryNotFoundError } from "../domain/errors";

describe("get-member-context service", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(commonDir)) {
      fs.rmSync(path.join(commonDir, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(externalDir)) {
      fs.rmSync(path.join(externalDir, entry), { recursive: true, force: true });
    }
  });

  it("should expose resolved routing metadata for a standard project member", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| ARCHI | Architecture | mailbox_ARCHI.md | active |\n"
    );
    const context = getMemberContextService("TEST", "ARCHI");
    expect(context.project_handle).toBe("TEST");
    expect(context.project_path).toBe(tempDir);
    expect(context.project_language).toBe("French");
    expect(context.role).toBe("Architecture");
    expect(context.resolved_mailbox).toBe(path.join(tempDir, "mailbox_ARCHI.md"));
    expect(context.resolved_archive).toBe(path.join(tempDir, "mailbox_ARCHI_archive.md"));
    expect(context.resolved_outbox).toBe(path.join(tempDir, "outbox_ARCHI.md"));
    expect(context.is_special_handle).toBe(false);
  });

  it("should resolve HUMAN via its canonical absolute mailbox under COMMON_ROOT", () => {
    const humanMailbox = path.join(commonDir, "mailbox_HUMAN.md");
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| HUMAN | User | ${humanMailbox} | active |\n`
    );
    const context = getMemberContextService("TEST", HUMAN_HANDLE);
    expect(context.resolved_mailbox).toBe(humanMailbox);
    expect(context.resolved_archive).toBe(path.join(commonDir, "mailbox_HUMAN_archive.md"));
    expect(context.resolved_outbox).toBe(path.join(commonDir, "outbox_HUMAN.md"));
    expect(context.is_special_handle).toBe(true);
  });

  it("should preserve absolute transverse mailbox paths", () => {
    const externalMailbox = path.join(externalDir, "mailbox_SHARED.md");
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| SHARED | Shared Agent | ${externalMailbox} | active |\n`
    );
    const context = getMemberContextService("TEST", "SHARED");
    expect(context.resolved_mailbox).toBe(externalMailbox);
    expect(context.resolved_archive).toBe(path.join(externalDir, "mailbox_SHARED_archive.md"));
    expect(context.resolved_outbox).toBe(path.join(externalDir, "outbox_SHARED.md"));
  });

  it("should throw when the handle is missing from the roster", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| ARCHI | Architecture | mailbox_ARCHI.md | active |\n"
    );
    expect(() => getMemberContextService("TEST", "UNKNOWN")).toThrow(RosterEntryNotFoundError);
  });
});
