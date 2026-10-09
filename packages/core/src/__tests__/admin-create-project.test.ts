import fs from "fs";
import path from "path";
import { createMessagingProject } from "../admin/create-project";
import { bootstrapCommonMessaging } from "../admin/bootstrap-common";

let tempCounter = 0;
function createTempDir(): string {
  tempCounter++;
  const tmpDir = path.join(process.cwd(), `tmp_test_${Date.now()}_${tempCounter}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const originalCommonRoot = process.env.COMMON_PATH;

describe("admin_create_messaging_project", () => {
  let tempCommon: string;
  let tempProject: string;

  beforeEach(() => {
    tempCommon = createTempDir();
    tempProject = createTempDir();
    process.env.COMMON_PATH = tempCommon;
    // Bootstrap COMMON first
    bootstrapCommonMessaging();
  });

  afterEach(() => {
    cleanupTempDir(tempCommon);
    cleanupTempDir(tempProject);
    process.env.COMMON_PATH = originalCommonRoot;
  });

  test("Test 3: Add valid project - line added, roster created", () => {
    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
    });

    expect(result.status).toBe("ok");
    expect(result.updated).toContain("projects_config.md");
    expect(result.created).toContain("roster.md");

    // Verify project in projects_config.md
    const projectsContent = fs.readFileSync(
      path.join(tempCommon, "projects_config.md"),
      "utf-8"
    );
    expect(projectsContent).toContain("TESTPROJECT");

    // Verify roster exists
    expect(fs.existsSync(path.join(tempProject, "roster.md"))).toBe(true);
  });

  test("Test 4: Add project already present - no duplication", () => {
    // First add
    createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
    });

    // Second add
    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
    });

    expect(result.status).toBe("warning");
    expect(result.updated).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);

    // Verify no duplication
    const projectsContent = fs.readFileSync(
      path.join(tempCommon, "projects_config.md"),
      "utf-8"
    );
    const matches = projectsContent.match(/TESTPROJECT/g) || [];
    expect(matches.length).toBe(1);
  });

  test("Test 8: project_path inexistent in strict mode - explicit error", () => {
    const nonExistentPath = path.join(process.cwd(), "nonexistent_" + Date.now());

    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: nonExistentPath,
      project_path_mode: "strict",
    });

    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("does not exist");
  });

  test("Test 9: project_path inexistent in create mode - directory created", () => {
    const newPath = path.join(process.cwd(), "tmp_new_project_" + Date.now());

    const result = createMessagingProject({
      project_handle: "NEWPROJECT",
      project_path: newPath,
      project_path_mode: "create",
    });

    expect(result.status).toBe("warning");
    expect(result.warnings.some(w => w.includes("Created project directory"))).toBe(true);
    expect(fs.existsSync(newPath)).toBe(true);

    // Cleanup
    cleanupTempDir(newPath);
  });

  test("Cannot create COMMON via this script", () => {
    const result = createMessagingProject({
      project_handle: "COMMON",
      project_path: tempProject,
    });

    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("admin_bootstrap_common_messaging");
  });

  test("project_path must be absolute", () => {
    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: "relative/path",
    });

    expect(result.status).toBe("error");
    expect(result.errors[0]).toContain("absolute");
  });

  test("projects_config.md empty - explicit error", () => {
    // Corrupt projects_config.md
    fs.writeFileSync(path.join(tempCommon, "projects_config.md"), "");

    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
    });

    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("empty");
    expect(result.errors[0]).toContain("V1 does not repair");
  });

  test("projects_config.md malformed - explicit error", () => {
    // Corrupt projects_config.md
    fs.writeFileSync(path.join(tempCommon, "projects_config.md"), "invalid content");

    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
    });

    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("no valid header/table");
    expect(result.errors[0]).toContain("V1 does not repair");
  });

  test("Dry run - no files modified", () => {
    const result = createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
      dry_run: true,
    });

    expect(result.status).toBe("ok");
    expect(result.updated).toContain("projects_config.md");
    expect(result.created).toContain("roster.md");

    // Verify no actual changes
    const projectsContent = fs.readFileSync(
      path.join(tempCommon, "projects_config.md"),
      "utf-8"
    );
    expect(projectsContent).not.toContain("TESTPROJECT");
    expect(fs.existsSync(path.join(tempProject, "roster.md"))).toBe(false);
  });
});
