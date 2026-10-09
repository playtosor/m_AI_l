import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_member-paths-test-"));
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_member-paths-external-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_member-paths-common-"));

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: commonDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
  HUMAN_HANDLE: "HUMAN",
  getCommonRoot: () => commonDir,
}));

import {
  resolveMemberPaths,
  resolveMemberPathsForNewHandle,
} from "../services/member-paths";
import { RosterEntry } from "../domain/types";

// ---------------------------------------------------------------------------
// V3.0 BAC 2A — T5: drive member-paths.ts through project + roster catalogs.
// `resolveMemberPaths` depends on getProject + getRoster; we emulate both as
// small in-test fixtures.
// ---------------------------------------------------------------------------

const rosterPath = path.join(tempDir, "roster.md");

const projects = [
  {
    name: "TEST",
    path: tempDir,
    roster: rosterPath,
    status: "active",
  },
  {
    name: "EXTERNAL",
    path: externalDir,
    status: "active",
  },
];

const rosters: Record<string, RosterEntry[]> = {
  [tempDir]: [
    { handle: "ARCHI", role: "Architect", mailbox: "mailbox_ARCHI.md", status: "active" },
    { handle: "OPS", role: "Ops", mailbox: path.join(externalDir, "mailbox_OPS.md"), status: "active" },
    { handle: "HUMAN", role: "User", mailbox: path.join(commonDir, "mailbox_HUMAN.md"), status: "active" },
  ],
  [externalDir]: [{ handle: "OPS", role: "External Ops", mailbox: "mailbox_OPS.md", status: "active" }],
};

jest.mock("../repositories/projects-repo", () => ({
  getProject: (projectHandle: string) => {
    const project = projects.find((p) => p.name === projectHandle);
    if (!project) {
      throw new Error(`Unknown project ${projectHandle}`);
    }
    return project;
  },
  getProjects: () => projects,
}));

jest.mock("../repositories/roster-repo", () => ({
  getRoster: (projectPath: string) => {
    if (!(projectPath in rosters)) {
      throw new Error(`Unknown project path ${projectPath}`);
    }
    return rosters[projectPath];
  },
}));

describe("member-paths (V3.0 BAC 2A — T5)", () => {
  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(externalDir, { recursive: true });
    fs.mkdirSync(commonDir, { recursive: true });
    // Seed the project's roster file (so the path is real).
    const content = [
      "| Handle | Role | Mailbox | Status |",
      "|--------|------|---------|--------|",
      "| ARCHI | Architect | mailbox_ARCHI.md | active |",
      `| OPS | Ops | ${path.join(externalDir, "mailbox_OPS.md")} | active |`,
      `| HUMAN | User | ${path.join(commonDir, "mailbox_HUMAN.md")} | active |`,
    ].join("\n");
    fs.writeFileSync(rosterPath, content, "utf-8");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
    fs.rmSync(commonDir, { recursive: true, force: true });
  });

  describe("resolveMemberPaths (handle that exists in roster)", () => {
    it("joins a relative roster mailbox under the project root", () => {
      const paths = resolveMemberPaths("TEST", "ARCHI");
      expect(paths.project_path).toBe(tempDir);
      expect(paths.roster_path).toBe(rosterPath);
      expect(paths.mailbox_path).toBe(path.join(tempDir, "mailbox_ARCHI.md"));
      expect(paths.archive_path).toBe(path.join(tempDir, "mailbox_ARCHI_archive.md"));
      expect(paths.outbox_path).toBe(path.join(tempDir, "outbox_ARCHI.md"));
    });

    it("honours an absolute roster mailbox without rewriting it", () => {
      const absoluteOps = path.join(externalDir, "mailbox_OPS.md");
      const paths = resolveMemberPaths("TEST", "OPS");
      expect(paths.mailbox_path).toBe(absoluteOps);
      // Archive / outbox derive from the resolved mailbox path, not the project root.
      expect(paths.archive_path).toBe(path.join(externalDir, "mailbox_OPS_archive.md"));
      expect(paths.outbox_path).toBe(path.join(externalDir, "outbox_OPS.md"));
    });

    it("canonicalises the handle to UPPERCASE in derived paths", () => {
      // V2.11: case-insensitive lookup; paths must still use uppercase.
      const paths = resolveMemberPaths("TEST", "archi");
      expect(paths.mailbox_path).toBe(path.join(tempDir, "mailbox_ARCHI.md"));
      expect(paths.outbox_path).toBe(path.join(tempDir, "outbox_ARCHI.md"));
    });

    it("throws when the handle is missing from the roster", () => {
      expect(() => resolveMemberPaths("TEST", "UNKNOWN")).toThrow();
    });

    it("throws when the project is unknown", () => {
      expect(() => resolveMemberPaths("NONEXISTENT", "ARCHI")).toThrow(/Unknown project/);
    });

    it("returns the canonical HUMAN mailbox resolution for HUMAN handle", () => {
      const paths = resolveMemberPaths("TEST", "HUMAN");
      expect(paths.mailbox_path).toBe(path.join(commonDir, "mailbox_HUMAN.md"));
      expect(paths.archive_path).toBe(path.join(commonDir, "mailbox_HUMAN_archive.md"));
      expect(paths.outbox_path).toBe(path.join(commonDir, "outbox_HUMAN.md"));
    });
  });

  describe("resolveMemberPathsForNewHandle (handle that may not exist yet)", () => {
    it("uses the default convention without consulting the roster", () => {
      const paths = resolveMemberPathsForNewHandle("TEST", "NEWHANDLE");
      expect(paths.project_path).toBe(tempDir);
      expect(paths.mailbox_path).toBe(path.join(tempDir, "mailbox_NEWHANDLE.md"));
      expect(paths.archive_path).toBe(path.join(tempDir, "mailbox_NEWHANDLE_archive.md"));
      expect(paths.outbox_path).toBe(path.join(tempDir, "outbox_NEWHANDLE.md"));
    });

    it("passes the handle through verbatim (doesn't normalize, since the handle may not exist yet)", () => {
      // Distinct from `resolveMemberPaths` (which canonicalizes because the
      // handle is known to be in the roster): this function accepts the
      // caller-supplied handle as-is, so a rename candidate's casing is
      // preserved as the user typed it. Callers that want uppercase paths
      // must normalize the handle themselves (e.g. via normalizeHandle from
      // lib/handles) before calling.
      const paths = resolveMemberPathsForNewHandle("TEST", "newhandle");
      expect(paths.mailbox_path).toBe(path.join(tempDir, "mailbox_newhandle.md"));
    });

    it("succeeds for a handle that does NOT exist in the roster (rename target)", () => {
      // Distinct from `resolveMemberPaths` which validates presence.
      expect(() =>
        resolveMemberPathsForNewHandle("TEST", "GHOST")
      ).not.toThrow();
    });

    it("uses the project's roster_path (overridable via project.roster)", () => {
      // The default roster_path is `<project>/roster.md` unless project.roster
      // is set; in this fixture project.roster IS set to rosterPath.
      const paths = resolveMemberPathsForNewHandle("TEST", "X");
      expect(paths.roster_path).toBe(rosterPath);
    });
  });
});
