import fs from "fs";
import path from "path";
import { validateMessagingBootstrap } from "../admin/validate-bootstrap";
import { bootstrapCommonMessaging } from "../admin/bootstrap-common";
import { createMessagingProject } from "../admin/create-project";

function createTempDir(): string {
  const tmpDir = path.join(process.cwd(), "tmp_test_" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const originalCommonRoot = process.env.COMMON_PATH;

describe("admin_validate_messaging_bootstrap", () => {
  let tempCommon: string;
  let tempProject: string;

  beforeEach(() => {
    tempCommon = createTempDir();
    tempProject = createTempDir();
    process.env.COMMON_PATH = tempCommon;
  });

  afterEach(() => {
    cleanupTempDir(tempCommon);
    cleanupTempDir(tempProject);
    process.env.COMMON_PATH = originalCommonRoot;
  });

  test("Test 5: Validation on healthy installation - status=ok", () => {
    // Bootstrap first
    bootstrapCommonMessaging();

    const result = validateMessagingBootstrap();

    expect(result.status).toBe("ok");
    expect(result.checks.some(c => c.name === "projects_config_exists" && c.status === "ok")).toBe(true);
    expect(result.checks.some(c => c.name === "common_entry_valid" && c.status === "ok")).toBe(true);
    expect(result.checks.some(c => c.name === "common_roster_exists" && c.status === "ok")).toBe(true);
  });

  test("Test 6: Validation on incoherent installation - explicit errors", () => {
    // Don't bootstrap - empty COMMON
    const result = validateMessagingBootstrap();

    expect(result.status).toBe("error");
    expect(result.checks.some(c => c.name === "projects_config_exists" && c.status === "error")).toBe(true);
  });

  test("Validation with specific project", () => {
    // Bootstrap and create project
    bootstrapCommonMessaging();
    createMessagingProject({
      project_handle: "TESTPROJECT",
      project_path: tempProject,
    });

    const result = validateMessagingBootstrap({
      project_handle: "TESTPROJECT",
    });

    expect(result.status).toBe("ok");
    expect(result.checks.some(c => c.name === "project_TESTPROJECT_valid" && c.status === "ok")).toBe(true);
    expect(result.checks.some(c => c.name === "project_TESTPROJECT_roster_exists" && c.status === "ok")).toBe(true);
  });

  test("Validation with missing project", () => {
    bootstrapCommonMessaging();

    const result = validateMessagingBootstrap({
      project_handle: "NONEXISTENT",
    });

    expect(result.status).toBe("error");
    expect(result.checks.some(c => c.name === "project_NONEXISTENT_valid" && c.status === "error")).toBe(true);
  });

  test("Validation detects duplicate handles", () => {
    bootstrapCommonMessaging();

    // Manually add duplicate entry
    const projectsPath = path.join(tempCommon, "projects_config.md");
    const content = fs.readFileSync(projectsPath, "utf-8");
    fs.writeFileSync(projectsPath, content + "| COMMON | C:\\duplicate | roster.md | - | active |\n");

    const result = validateMessagingBootstrap();

    expect(result.status).toBe("error");
    expect(result.checks.some(c => c.name === "no_duplicate_handles" && c.status === "error")).toBe(true);
  });

  test("Validation detects non-absolute path", () => {
    bootstrapCommonMessaging();

    // Add project with relative path
    const projectsPath = path.join(tempCommon, "projects_config.md");
    const content = fs.readFileSync(projectsPath, "utf-8");
    fs.writeFileSync(projectsPath, content + "| BADPROJECT | relative/path | roster.md | - | active |\n");

    const result = validateMessagingBootstrap({
      project_handle: "BADPROJECT",
    });

    expect(result.status).toBe("error");
    expect(result.checks.some(c => c.name === "project_BADPROJECT_valid" && c.status === "error")).toBe(true);
  });
});
