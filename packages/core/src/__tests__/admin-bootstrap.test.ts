import fs from "fs";
import path from "path";
import { bootstrapCommonMessaging } from "../admin/bootstrap-common";
import { validateMessagingBootstrap } from "../admin/validate-bootstrap";

// Test helper to create temp directories
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

// Mock COMMON_ROOT for tests
const originalCommonRoot = process.env.COMMON_PATH;

describe("admin_bootstrap_common_messaging", () => {
  let tempCommon: string;

  beforeEach(() => {
    tempCommon = createTempDir();
    process.env.COMMON_PATH = tempCommon;
  });

  afterEach(() => {
    cleanupTempDir(tempCommon);
    process.env.COMMON_PATH = originalCommonRoot;
  });

  test("Test 1: Bootstrap on empty installation - files created correctly", () => {
    const result = bootstrapCommonMessaging();

    expect(result.status).toBe("ok");
    expect(result.created).toContain("projects_config.md");
    expect(result.created).toContain("projects_config_archive.md");
    expect(result.created).toContain("roster.md");
    expect(result.updated).toContain("projects_config.md"); // COMMON entry added

    // Verify files exist
    expect(fs.existsSync(path.join(tempCommon, "projects_config.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempCommon, "projects_config_archive.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempCommon, "roster.md"))).toBe(true);

    // Verify projects_config.md contains COMMON
    const projectsContent = fs.readFileSync(
      path.join(tempCommon, "projects_config.md"),
      "utf-8"
    );
    expect(projectsContent).toContain("COMMON");
  });

  test("Test 2: Bootstrap on partial installation - only missing files completed", () => {
    // Pre-create projects_config.md without COMMON entry
    fs.writeFileSync(
      path.join(tempCommon, "projects_config.md"),
      "| name | path | roster | language | status |\n|------|------|--------|----------|--------|\n"
    );

    const result = bootstrapCommonMessaging();

    expect(result.status).toBe("ok");
    expect(result.created).toContain("projects_config_archive.md");
    expect(result.created).toContain("roster.md");
    expect(result.updated).toContain("projects_config.md"); // COMMON entry added
    expect(result.created).not.toContain("projects_config.md"); // Not created, already existed
  });

  test("Test 2b: Bootstrap relaunch on already healthy installation - identical state", () => {
    // First bootstrap
    bootstrapCommonMessaging();

    // Second bootstrap
    const result = bootstrapCommonMessaging();

    expect(result.status).toBe("ok");
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  test("Test 7a: Existing file but empty - explicit error", () => {
    // Create empty projects_config.md
    fs.writeFileSync(path.join(tempCommon, "projects_config.md"), "");

    const result = bootstrapCommonMessaging();

    // Should stop with explicit error
    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("empty");
    expect(result.errors[0]).toContain("V1 does not repair");
  });

  test("Test 7b: Existing file but malformed (no header) - explicit error", () => {
    // Create malformed projects_config.md (no header)
    fs.writeFileSync(path.join(tempCommon, "projects_config.md"), "some random content\nwithout proper table");

    const result = bootstrapCommonMessaging();

    // Should stop with explicit error
    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("no valid header/table");
    expect(result.errors[0]).toContain("V1 does not repair");
  });

  test("Test 7c: Existing file but malformed (no separator) - explicit error", () => {
    // Create malformed projects_config.md (header but no separator)
    fs.writeFileSync(path.join(tempCommon, "projects_config.md"), "| name | path |\n| COMMON | C:\\test |");

    const result = bootstrapCommonMessaging();

    // Should stop with explicit error
    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("no valid header/table");
  });

  test("Dry run - no files created", () => {
    const result = bootstrapCommonMessaging({ dry_run: true });

    expect(result.status).toBe("ok");
    expect(result.created).toContain("projects_config.md");
    expect(result.created).toContain("projects_config_archive.md");
    expect(result.created).toContain("roster.md");

    // Verify no files were actually created
    expect(fs.existsSync(path.join(tempCommon, "projects_config.md"))).toBe(false);
    expect(fs.existsSync(path.join(tempCommon, "roster.md"))).toBe(false);
  });
});
