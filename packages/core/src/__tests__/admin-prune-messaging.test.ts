import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_prune-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_prune-common-"));

// Mock constants.ts AVANT tout import
jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: commonDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
  getCommonRoot: () => commonDir,
}));

// Mock paths.ts pour que getProjectsPath retourne commonDir/projects_config.md
jest.mock("../lib/paths", () => {
  const actual = jest.requireActual("../lib/paths");
  return {
    ...actual,
    getProjectsPath: () => path.join(commonDir, "projects_config.md"),
  };
});

import { adminPruneMessaging } from "../admin/prune-messaging";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupTestProject(handle: string, files: Record<string, string>) {
  const projectDir = path.join(tempDir, handle);
  fs.mkdirSync(projectDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(projectDir, filename), content, "utf8");
  }
  return projectDir;
}

function createRoster(projectDir: string, entries: Array<{ handle: string; mailbox: string }>) {
  const rosterPath = path.join(projectDir, "roster.md");
  const rows = entries.map(e => `| ${e.handle} | Agent | ${e.mailbox} | active |`);
  const content = `| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n${rows.join("\n")}\n`;
  fs.writeFileSync(rosterPath, content, "utf8");
}

function createProjectsConfig(projects: Array<{ handle: string; path: string }>) {
  const configPath = path.join(commonDir, "projects_config.md");
  const rows = projects.map(p => `| ${p.handle} | ${p.path} | roster.md | fr | active |`);
  const content = `| Project | Path | Roster | Lang | Status |\n|---------|------|--------|------|--------|\n${rows.join("\n")}\n`;
  fs.writeFileSync(configPath, content, "utf8");
}

function cleanup() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  if (fs.existsSync(commonDir)) {
    fs.rmSync(commonDir, { recursive: true });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("adminPruneMessaging V2", () => {
  beforeEach(() => {
    cleanup();
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(commonDir, { recursive: true });
  });

  afterAll(() => {
    cleanup();
  });

  test("Cas 1: dry_run n'écrit rien, plan d'action complet", () => {
    const projectDir = setupTestProject("MAILEXPORT", {
      "mailbox_ARCHI_archive.md": `ARCHI // 20230101-1200 // P1 // Old // Body1
ARCHI // 20240115-1430 // P1 // Recent // Body2
<!-- END -->`,
      "outbox_ARCHI.md": `ARCHI // 20230101-1200 // P1 // OldOut // Body1
<!-- END -->`,
    });
    createRoster(projectDir, [{ handle: "ARCHI", mailbox: "mailbox_ARCHI.md" }]);
    createProjectsConfig([{ handle: "MAILEXPORT", path: projectDir }]);

    const result = adminPruneMessaging({ dry_run: true, retention_days: 30 });

    expect(result.status).toBe("ok");
    expect(result.projects.length).toBeGreaterThan(0);
    const project = result.projects.find(p => p.project_handle === "MAILEXPORT");
    expect(project).toBeDefined();
    expect(project!.files_scanned).toBeGreaterThan(0);
    expect(project!.entries_to_move).toBeGreaterThan(0);
    expect(project!.actions.every(a => a.startsWith("would_"))).toBe(true);
  });

  test("Cas 2: exécution déplace vers pruned/ + sentinel présent", () => {
    const projectDir = setupTestProject("MAILEXPORT", {
      "mailbox_ARCHI_archive.md": `ARCHI // 20230101-1200 // P1 // Old // Body1
<!-- END -->`,
    });
    createRoster(projectDir, [{ handle: "ARCHI", mailbox: "mailbox_ARCHI.md" }]);
    createProjectsConfig([{ handle: "MAILEXPORT", path: projectDir }]);

    const result = adminPruneMessaging({ dry_run: false, retention_days: 30 });

    expect(result.status).toBe("ok");
    const prunedDir = path.join(projectDir, "pruned");
    expect(fs.existsSync(prunedDir)).toBe(true);
    const archivePath = path.join(projectDir, "mailbox_ARCHI_archive.md");
    const content = fs.readFileSync(archivePath, "utf8");
    expect(content).toContain("<!-- END -->");
  });

  test("Cas 3: project_handle ciblage ne touche qu'un projet", () => {
    const dirA = setupTestProject("PROJECT_A", {
      "mailbox_ARCHI_archive.md": `ARCHI // 20230101-1200 // P1 // Old // Body1
<!-- END -->`,
    });
    const dirB = setupTestProject("PROJECT_B", {
      "mailbox_ARCHI_archive.md": `ARCHI // 20230101-1200 // P1 // Old // Body1
<!-- END -->`,
    });
    createRoster(dirA, [{ handle: "ARCHI", mailbox: "mailbox_ARCHI.md" }]);
    createRoster(dirB, [{ handle: "ARCHI", mailbox: "mailbox_ARCHI.md" }]);
    createProjectsConfig([
      { handle: "PROJECT_A", path: dirA },
      { handle: "PROJECT_B", path: dirB },
    ]);

    const result = adminPruneMessaging({ dry_run: true, retention_days: 30, project_handle: "PROJECT_A" });

    expect(result.projects.length).toBe(1);
    expect(result.projects[0].project_handle).toBe("PROJECT_A");
  });

  test("Cas 2b: idempotence — re-run après move ne duplique pas les entrées", () => {
    const projectDir = setupTestProject("MAILEXPORT", {
      "mailbox_ARCHI_archive.md": `ARCHI // 20230101-1200 // P1 // Old // Body1
ARCHI // 20240115-1430 // P1 // Recent // Body2
<!-- END -->`,
    });
    createRoster(projectDir, [{ handle: "ARCHI", mailbox: "mailbox_ARCHI.md" }]);
    createProjectsConfig([{ handle: "MAILEXPORT", path: projectDir }]);

    // First run: actual move
    adminPruneMessaging({ dry_run: false, retention_days: 30 });
    const prunedPath = path.join(projectDir, "pruned", "mailbox_ARCHI_archive.md");
    const firstPruned = fs.readFileSync(prunedPath, "utf8");
    const firstOldCount = (firstPruned.match(/Body1/g) || []).length;

    // Second run on the now-truncated source: no more old entries
    const result2 = adminPruneMessaging({ dry_run: false, retention_days: 30 });
    const project2 = result2.projects.find(p => p.project_handle === "MAILEXPORT");
    expect(project2!.entries_to_move).toBe(0);

    // Pruned file should still have exactly one copy of Body1
    const secondPruned = fs.readFileSync(prunedPath, "utf8");
    const secondOldCount = (secondPruned.match(/Body1/g) || []).length;
    expect(secondOldCount).toBe(firstOldCount);
  });
});
