import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "count-messages-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "count-messages-common-test-"));
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

import { countMessages } from "../services/count-messages";

describe("countMessages service", () => {
  let mailboxFile: string;
  let archiveFile: string;

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
  });

  it("returns count from a populated mailbox (ignoring body lines and sentinel)", () => {
    fs.writeFileSync(
      mailboxFile,
      "A // 20260101-0900 // H // First // body-1\n" +
        "B // 20260102-0900 // M // Second // body-2\n" +
        "C // 20260103-0900 // L // Third // body-3\n" +
        "<!-- END -->\n"
    );

    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
      })
    ).toEqual({ count: 3 });
  });

  it("does not count multi-line body continuation lines", () => {
    fs.writeFileSync(
      mailboxFile,
      "A // 20260101-0900 // H // Subject // line-1\n" +
        "line-2 of body\n" +
        "line-3 of body\n" +
        "B // 20260102-0900 // M // Second // only-line\n" +
        "<!-- END -->\n"
    );

    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
      })
    ).toEqual({ count: 2 });
  });

  it("returns 0 for an empty mailbox", () => {
    fs.writeFileSync(mailboxFile, "<!-- END -->\n");
    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
      })
    ).toEqual({ count: 0 });
  });

  it("returns 0 (not error) when the mailbox file is missing", () => {
    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
      })
    ).toEqual({ count: 0 });
  });

  it("returns 0 (not error) when the archive file is missing", () => {
    fs.writeFileSync(mailboxFile, "<!-- END -->\n");
    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "archive",
      })
    ).toEqual({ count: 0 });
  });

  it("counts from the archive when source=archive", () => {
    fs.writeFileSync(
      archiveFile,
      "X // 20260101-0800 // M // Archived // old-body\n" +
        "Y // 20260102-0800 // H // Archived-2 // old-body-2\n" +
        "Z // 20260103-0800 // L // Archived-3 // old-body-3\n" +
        "<!-- END -->\n"
    );

    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "archive",
      })
    ).toEqual({ count: 3 });
  });

  it("accepts the legacy 4-segment header format (no priority)", () => {
    fs.writeFileSync(
      mailboxFile,
      "A // 20260101-0900 // Legacy // body-1\n" +
        "B // 20260102-0900 // H // Modern // body-2\n" +
        "<!-- END -->\n"
    );

    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
      })
    ).toEqual({ count: 2 });
  });

  it("does not count invalid_lines (lines that are neither header nor sentinel)", () => {
    fs.writeFileSync(
      mailboxFile,
      "garbage line that is not a header\n" +
        "A // 20260101-0900 // H // Only // body\n" +
        "another garbage line\n" +
        "<!-- END -->\n"
    );

    expect(
      countMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
      })
    ).toEqual({ count: 1 });
  });
});
