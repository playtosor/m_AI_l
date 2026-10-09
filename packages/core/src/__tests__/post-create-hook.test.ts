import path from "path";
import fs from "fs";
import os from "os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-hook-"));

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: tempDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
  HUMAN_HANDLE: "HUMAN",
  // V3.0 BAC 2A — S1: allowlist is read by post-create-hook; preserve real values
  // so calls to `isCommandAllowed("node")` succeed in the test.
  POST_CREATE_HOOK_ALLOWLIST: ["node", "bash", "cmd", "pwsh", "sh"],
  POST_CREATE_HOOK_ENV_ALLOWLIST: ["PATH", "PATHEXT", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG", "LC_ALL"],
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TEST",
    path: tempDir,
    status: "active",
  }),
  getProjects: () => [
    {
      name: "TEST",
      path: tempDir,
      status: "active",
    },
  ],
}));

import { getPostCreateHookStatus, configurePostCreateHook, clearPostCreateHook, runPostCreateHook } from "../services/post-create-hook";
import { HUMAN_HANDLE } from "../domain/constants";

describe("post-create hook", () => {
  beforeEach(() => {
    // Clear any existing config
    const configPath = path.join(tempDir, ".messaging-global-config.json");
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should return configured: false when no hook is set", () => {
    const status = getPostCreateHookStatus();
    expect(status.configured).toBe(false);
  });

  test("should configure and get hook status", () => {
    const config = {
      enabled: true,
      mode: "command" as const,
      command_path: "echo",
      args: ["test"],
      cwd: tempDir,
      payload_mode: "stdin_json" as const,
    };

    configurePostCreateHook(config);

    const status = getPostCreateHookStatus();
    expect(status.configured).toBe(true);
    expect(status.mode).toBe("command");
  });

  test("should clear hook configuration", () => {
    const config = {
      enabled: true,
      mode: "command" as const,
      command_path: "echo",
      payload_mode: "stdin_json" as const,
    };

    configurePostCreateHook(config);
    expect(getPostCreateHookStatus().configured).toBe(true);

    clearPostCreateHook();
    expect(getPostCreateHookStatus().configured).toBe(false);
  });

  test("should run hook when configured", () => {
    const config = {
      enabled: true,
      mode: "command" as const,
      command_path: "node",
      args: ["-e", "console.log('hook executed')"],
      cwd: tempDir,
      payload_mode: "stdin_json" as const,
    };

    configurePostCreateHook(config);

    const result = runPostCreateHook({
      project_handle: "TEST",
      project_path: tempDir,
      trigger: "manual",
      requested_by: { kind: "human", handle: HUMAN_HANDLE },
    });

    if (result.status !== "success") {
      console.log("Hook result:", JSON.stringify(result, null, 2));
    }

    expect(result.status).toBe("success");
  });
});
