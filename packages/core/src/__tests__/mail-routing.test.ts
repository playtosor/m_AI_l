import { resolveOutboxPathFromMailboxPath, validateAbsoluteMailboxPath, resolveMailboxPathFromValue } from "../services/mail-routing";
import { FileOperationError } from "../domain/errors";
import { getProjects } from "../repositories/projects-repo";
import { COMMON_ROOT } from "../domain/constants";
import fs from "fs";
import path from "path";

jest.mock("../lib/paths", () => ({
  getProjectsPath: () => path.join(__dirname, "test_projects_config.md"),
}));

describe("validateAbsoluteMailboxPath", () => {
  const projectsFile = path.join(__dirname, "test_projects_config.md");

  beforeEach(() => {
    if (fs.existsSync(projectsFile)) {
      fs.unlinkSync(projectsFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(projectsFile)) {
      fs.unlinkSync(projectsFile);
    }
  });

  it("accepts a path under COMMON_ROOT", () => {
    const commonRoot = path.resolve(COMMON_ROOT);
    const testPath = path.join(commonRoot, "mailbox_test.md");
    expect(() => validateAbsoluteMailboxPath(testPath)).not.toThrow();
  });

  it("accepts a path under an active project", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project | Path |\n" +
      "|---------|------|\n" +
      "| DEMO | C:\\dev\\demo |\n"
    );
    const testPath = "C:\\dev\\demo\\mailbox_test.md";
    expect(() => validateAbsoluteMailboxPath(testPath)).not.toThrow();
  });

  it("accepts a path under a project with explicit 'active' status", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project | Path | Status |\n|---------|------|--------|\n" +
      "| DEMO | C:\\dev\\demo | active |\n"
    );
    const testPath = "C:\\dev\\demo\\mailbox_test.md";
    expect(() => validateAbsoluteMailboxPath(testPath)).not.toThrow();
  });

  it("rejects a path outside authorized zones", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project | Path |\n" +
      "|---------|------|\n" +
      "| DEMO | C:\\dev\\demo |\n"
    );
    const testPath = "C:\\Windows\\System32\\evil.md";
    expect(() => validateAbsoluteMailboxPath(testPath)).toThrow(FileOperationError);
  });

  it("rejects a path under an inactive project", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project | Path | Status |\n|---------|------|--------|\n" +
      "| DEMO | C:\\dev\\demo | inactive |\n"
    );
    const testPath = "C:\\dev\\demo\\mailbox.md";
    expect(() => validateAbsoluteMailboxPath(testPath)).toThrow(FileOperationError);
  });

  it("rejects a path that is exactly COMMON_ROOT (not under it)", () => {
    const commonRoot = path.resolve(COMMON_ROOT);
    expect(() => validateAbsoluteMailboxPath(commonRoot)).toThrow(FileOperationError);
  });

  it("rejects a path that is exactly a project root (not under it)", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project | Path |\n" +
      "|---------|------|\n" +
      "| DEMO | C:\\dev\\demo |\n"
    );
    expect(() => validateAbsoluteMailboxPath("C:\\dev\\demo")).toThrow(FileOperationError);
  });
});

describe("resolveOutboxPathFromMailboxPath (V2.12)", () => {
  it("derives outbox path for default mailbox using UPPERCASE handle", () => {
    const mailbox = path.join("C:\\dev\\project", "mailbox_BETA.md");
    expect(resolveOutboxPathFromMailboxPath(mailbox, "BETA")).toBe(
      path.join("C:\\dev\\project", "outbox_BETA.md")
    );
  });

  it("normalises lowercase caller to UPPERCASE outbox path (case-insensitive, FS-safe)", () => {
    // V2.12 fix: a caller passing "beta" against a canonical "BETA" roster
    // entry must produce outbox_BETA.md, otherwise on macOS/Linux (FS
    // case-sensitive) the lookup silently misses the file.
    const mailbox = path.join("C:\\dev\\project", "mailbox_BETA.md");
    expect(resolveOutboxPathFromMailboxPath(mailbox, "beta")).toBe(
      path.join("C:\\dev\\project", "outbox_BETA.md")
    );
    expect(resolveOutboxPathFromMailboxPath(mailbox, "BeTa")).toBe(
      path.join("C:\\dev\\project", "outbox_BETA.md")
    );
    expect(resolveOutboxPathFromMailboxPath(mailbox, "  beta  ")).toBe(
      path.join("C:\\dev\\project", "outbox_BETA.md")
    );
  });

  it("falls back to outbox_${HANDLE_NORMALIZED}.md when mailbox stem does not match", () => {
    // Non-default mailbox stem: derivation falls back to plain pattern with
    // the normalised handle.
    const mailbox = path.join("C:\\dev\\project", "inbox_ZED.md");
    expect(resolveOutboxPathFromMailboxPath(mailbox, "beta")).toBe(
      path.join("C:\\dev\\project", "outbox_BETA.md")
    );
  });
});

describe("resolveMailboxPathFromValue (WS3 #10)", () => {
  const projectPath = "C:\\dev\\project";

  it("joins a relative mailbox value under the project path", () => {
    const result = resolveMailboxPathFromValue(projectPath, "TEST", "mailbox_TEST.md");
    expect(result).toBe(path.join(projectPath, "mailbox_TEST.md"));
  });

  it("accepts a relative path with subdirectories (legitimate use case)", () => {
    const result = resolveMailboxPathFromValue(projectPath, "TEST", "custom_dir/mailbox_TEST.md");
    expect(result).toBe(path.join(projectPath, "custom_dir", "mailbox_TEST.md"));
  });

  it("rejects relative mailbox paths containing '..' segments (path traversal)", () => {
    expect(() => resolveMailboxPathFromValue(projectPath, "TEST", "../secret.md")).toThrow(FileOperationError);
    expect(() => resolveMailboxPathFromValue(projectPath, "TEST", "..\\secret.md")).toThrow(FileOperationError);
    expect(() => resolveMailboxPathFromValue(projectPath, "TEST", "subdir/../../secret.md")).toThrow(FileOperationError);
  });

  it("honours an absolute mailbox path under COMMON_ROOT", () => {
    const commonRoot = path.resolve(COMMON_ROOT);
    const absolutePath = path.join(commonRoot, "mailbox.md");
    const result = resolveMailboxPathFromValue(projectPath, "TEST", absolutePath);
    expect(result).toBe(absolutePath);
  });
});
