// V2.11: regression tests for the case-insensitive lookups across core services.
// These tests do not assert new functionality — they assert that a lowercase
// caller still resolves the canonical uppercase roster entry. The pattern
// (write fixture with UPPERCASE handle, query with mixed-case) is shared
// across services to keep the regression matrix uniform.

import fs from "fs";
import os from "os";
import path from "path";

// Capture constants BEFORE the mock factory is hoisted (see core lookups CI).
const { HUMAN_HANDLE } = jest.requireActual("../domain/constants") as typeof import("../domain/constants");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-handle-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-handle-common-"));
const rosterFile = path.join(tempDir, "roster.md");

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
import { countMessages } from "../services/count-messages";
import { resolveMemberPaths } from "../services/member-paths";
import { findRosterEntry } from "../services/mail-routing";

const ROSTER_HEADER = "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n";

function writeRoster(entries: Array<{ handle: string; mailbox: string; status?: string }>): void {
  const body = entries
    .map(e => `| ${e.handle} | Tester | ${e.mailbox} | ${e.status ?? "active"} |`)
    .join("\n");
  fs.writeFileSync(rosterFile, ROSTER_HEADER + body + "\n");
}

describe("case-insensitive lookups (V2.11)", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      if (entry === "roster.md") continue;
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
  });

  it("findRosterEntry matches lowercase caller against uppercase roster", () => {
    writeRoster([{ handle: "BETA", mailbox: "mailbox_BETA.md" }]);
    expect(findRosterEntry(
      [{ handle: "BETA", role: "Tester", mailbox: "mailbox_BETA.md", status: "active" }],
      "beta"
    )).toBeDefined();
    expect(findRosterEntry(
      [{ handle: "BETA", role: "Tester", mailbox: "mailbox_BETA.md", status: "active" }],
      "BeTa"
    )?.handle).toBe("BETA");
  });

  it("getMemberContextService resolves lowercase caller", () => {
    writeRoster([{ handle: "GAMMA", mailbox: "mailbox_GAMMA.md" }]);
    fs.writeFileSync(path.join(tempDir, "mailbox_GAMMA.md"), "<!-- END -->\n");

    const ctx = getMemberContextService("TEST", "gamma");
    expect(ctx.handle).toBe("GAMMA");
    expect(ctx.resolved_mailbox).toBe(path.join(tempDir, "mailbox_GAMMA.md"));
  });

  it("countMessages handles lowercase mailbox handle", () => {
    writeRoster([{ handle: "DELTA", mailbox: "mailbox_DELTA.md" }]);
    fs.writeFileSync(
      path.join(tempDir, "mailbox_DELTA.md"),
      "A // 20260101-0900 // M // Hello // body\n<!-- END -->\n"
    );

    const result = countMessages({
      mailbox: { project_handle: "TEST", handle: "delta" },
      source: "active",
    });
    expect(result.count).toBe(1);
  });

  it("resolveMemberPaths is case-insensitive (lowercase caller returns equal paths)", () => {
    writeRoster([{ handle: "EPSILON", mailbox: "mailbox_EPSILON.md" }]);
    const lower = resolveMemberPaths("TEST", "epsilon");
    const upper = resolveMemberPaths("TEST", "EPSILON");
    expect(lower.mailbox_path).toBe(upper.mailbox_path);
    expect(upper.mailbox_path).toBe(path.join(tempDir, "mailbox_EPSILON.md"));
  });

  it("resolveMemberPaths canonicalises HUMAN regardless of case", () => {
    writeRoster([
      { handle: "HUMAN", mailbox: path.join(commonDir, "mailbox_HUMAN.md") },
    ]);
    fs.writeFileSync(path.join(commonDir, "mailbox_HUMAN.md"), "<!-- END -->\n");

    const lower = resolveMemberPaths("TEST", "human");
    const upper = resolveMemberPaths("TEST", "HUMAN");
    expect(lower.mailbox_path).toBe(upper.mailbox_path);
    expect(upper.mailbox_path).toBe(path.join(commonDir, "mailbox_HUMAN.md"));
  });

  it("regression: HUMAN_HANDLE constant equals the uppercase string", () => {
    expect(HUMAN_HANDLE).toBe("HUMAN");
  });
});
