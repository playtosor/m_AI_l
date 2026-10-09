import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_config-persistence-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_config-persistence-common-"));

// V3.0 BAC 2A — T2: drive the config persistence layer end-to-end.
// We mock `domain/constants` so COMMON_ROOT maps to our temp commonDir and
// project config paths resolve under tempDir.
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

// Import AFTER the mock so the module evaluates with our temp COMMON_ROOT.
import {
  readProjectConfig,
  writeProjectConfig,
  getProjectConfigPath,
  readGlobalConfig,
  writeGlobalConfig,
  getGlobalConfigPath,
  getPostCreateHookConfig,
  setPostCreateHookConfig,
  removePostCreateHookConfig,
} from "../lib/config-persistence";
import { getPostCreateHookStatus, runPostCreateHook } from "../services/post-create-hook";

describe("config-persistence (V3.0 BAC 2A — T2)", () => {
  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(commonDir)) {
      fs.rmSync(commonDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(commonDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(commonDir)) {
      fs.rmSync(commonDir, { recursive: true, force: true });
    }
  });

  describe("paths", () => {
    it("getProjectConfigPath returns <project>/.messaging-config.json", () => {
      expect(getProjectConfigPath(tempDir)).toBe(path.join(tempDir, ".messaging-config.json"));
    });

    it("getGlobalConfigPath returns COMMON_ROOT/.messaging-global-config.json", () => {
      expect(getGlobalConfigPath()).toBe(path.join(commonDir, ".messaging-global-config.json"));
    });
  });

  describe("project config", () => {
    it("readProjectConfig returns {} when file is missing", () => {
      expect(readProjectConfig(tempDir)).toEqual({});
    });

    it("writeProjectConfig then readProjectConfig round-trips the payload", () => {
      const payload = { custom_field: "kept" } as any;
      writeProjectConfig(tempDir, payload);

      const written = JSON.parse(
        fs.readFileSync(path.join(tempDir, ".messaging-config.json"), "utf-8")
      );
      expect(written).toEqual(payload);
      expect(readProjectConfig(tempDir)).toEqual(payload);
    });

    it("writeProjectConfig overwrites previous content atomically", () => {
      writeProjectConfig(tempDir, { custom_field: "ARCHI" } as any);
      writeProjectConfig(tempDir, { custom_field: "OPS" } as any);

      expect(readProjectConfig(tempDir)).toEqual({ custom_field: "OPS" });
    });

    it("readProjectConfig throws ConfigCorruptionError on invalid JSON (not silently {})", () => {
      fs.writeFileSync(path.join(tempDir, ".messaging-config.json"), "{not json", "utf-8");

      expect(() => readProjectConfig(tempDir)).toThrow(/Corrupt/);
    });
  });

  describe("global config", () => {
    it("readGlobalConfig returns {} when file is missing", () => {
      expect(readGlobalConfig()).toEqual({});
    });

    it("writeGlobalConfig then readGlobalConfig round-trips the payload", () => {
      const payload = { post_create_hook: { enabled: true, mode: "command", command_path: "node", payload_mode: "stdin_json" } } as any;
      writeGlobalConfig(payload);

      const written = JSON.parse(
        fs.readFileSync(path.join(commonDir, ".messaging-global-config.json"), "utf-8")
      );
      expect(written).toEqual(payload);
      expect(readGlobalConfig()).toEqual(payload);
    });

    it("surfaces corruption (not silently {}) — SIMPLIFY critical-feedback #13", () => {
      // Present-but-corrupt global config must be surfaced, not returned as {}.
      fs.writeFileSync(
        path.join(commonDir, ".messaging-global-config.json"),
        "{ this is not valid json",
        "utf-8"
      );

      expect(() => readGlobalConfig()).toThrow(/Corrupt/);

      // getPostCreateHookStatus must distinguish corruption from "not configured".
      const status = getPostCreateHookStatus();
      expect(status.configured).toBe(false);
      expect(status.error).toMatch(/corrupt/i);

      // runPostCreateHook must report corruption distinctly from "not configured".
      const result = runPostCreateHook({
        project_handle: "TEST",
        project_path: tempDir,
        trigger: "manual",
        requested_by: { kind: "human", handle: "HUMAN" },
      });
      expect(result.status).toBe("error");
      expect(result.stderr).toMatch(/corrupt/i);
    });

    it("missing global config still returns {} (legit 'not configured')", () => {
      expect(readGlobalConfig()).toEqual({});
      const status = getPostCreateHookStatus();
      expect(status.configured).toBe(false);
      expect(status.error).toBeUndefined();
    });
  });

  describe("project config validation (validateProjectConfig)", () => {
    it("rejects non-object JSON (array) → throws ConfigCorruptionError", () => {
      fs.writeFileSync(
        path.join(tempDir, ".messaging-config.json"),
        "[]",
        "utf-8"
      );
      expect(() => readProjectConfig(tempDir)).toThrow(/Corrupt/);
    });

    it("accepts empty config", () => {
      fs.writeFileSync(
        path.join(tempDir, ".messaging-config.json"),
        JSON.stringify({}),
        "utf-8"
      );
      expect(readProjectConfig(tempDir)).toEqual({});
    });

    it("accepts additional unknown fields without throwing", () => {
      fs.writeFileSync(
        path.join(tempDir, ".messaging-config.json"),
        JSON.stringify({ extra: { nested: true } }),
        "utf-8"
      );
      expect(readProjectConfig(tempDir)).toEqual({
        extra: { nested: true },
      });
    });
  });

  describe("global config validation (validateGlobalConfig)", () => {
    it("rejects post_create_hook.mode that is not 'command' → throws ConfigCorruptionError", () => {
      fs.writeFileSync(
        path.join(commonDir, ".messaging-global-config.json"),
        JSON.stringify({ post_create_hook: { enabled: true, mode: "exec", command_path: "x", payload_mode: "stdin_json" } }),
        "utf-8"
      );
      expect(() => readGlobalConfig()).toThrow(/Corrupt/);
    });

    it("rejects post_create_hook.payload_mode that is not 'stdin_json' → throws ConfigCorruptionError", () => {
      fs.writeFileSync(
        path.join(commonDir, ".messaging-global-config.json"),
        JSON.stringify({ post_create_hook: { enabled: true, mode: "command", command_path: "x", payload_mode: "env" } }),
        "utf-8"
      );
      expect(() => readGlobalConfig()).toThrow(/Corrupt/);
    });

    it("rejects post_create_hook.enabled that is not boolean → throws ConfigCorruptionError", () => {
      fs.writeFileSync(
        path.join(commonDir, ".messaging-global-config.json"),
        JSON.stringify({ post_create_hook: { enabled: "yes", mode: "command", command_path: "x", payload_mode: "stdin_json" } }),
        "utf-8"
      );
      expect(() => readGlobalConfig()).toThrow(/Corrupt/);
    });

    it("rejects post_create_hook.command_path that is not string → throws ConfigCorruptionError", () => {
      fs.writeFileSync(
        path.join(commonDir, ".messaging-global-config.json"),
        JSON.stringify({ post_create_hook: { enabled: true, mode: "command", command_path: 42, payload_mode: "stdin_json" } }),
        "utf-8"
      );
      expect(() => readGlobalConfig()).toThrow(/Corrupt/);
    });

    it("accepts a fully valid post_create_hook", () => {
      const cfg = { post_create_hook: { enabled: true, mode: "command", command_path: "node", payload_mode: "stdin_json" } };
      fs.writeFileSync(
        path.join(commonDir, ".messaging-global-config.json"),
        JSON.stringify(cfg),
        "utf-8"
      );
      expect(readGlobalConfig()).toEqual(cfg);
    });
  });

  describe("post-create-hook helpers", () => {
    it("getPostCreateHookConfig returns undefined when no hook configured", () => {
      expect(getPostCreateHookConfig()).toBeUndefined();
    });

    it("setPostCreateHookConfig installs the hook; getPostCreateHookConfig returns it", () => {
      setPostCreateHookConfig({
        enabled: true,
        mode: "command",
        command_path: "bash",
        args: ["-c", "echo"],
        cwd: tempDir,
        env: { FOO: "bar" },
        timeout_ms: 1000,
        payload_mode: "stdin_json",
      });

      const read = getPostCreateHookConfig();
      expect(read).toBeDefined();
      expect(read!.enabled).toBe(true);
      expect(read!.command_path).toBe("bash");
      expect(read!.args).toEqual(["-c", "echo"]);
    });

    it("removePostCreateHookConfig clears the hook", () => {
      setPostCreateHookConfig({
        enabled: true,
        mode: "command",
        command_path: "node",
        payload_mode: "stdin_json",
      });
      expect(getPostCreateHookConfig()).toBeDefined();

      removePostCreateHookConfig();

      expect(getPostCreateHookConfig()).toBeUndefined();
      // Disk reflects the deletion too: the global config file may still
      // exist but must no longer carry post_create_hook.
      if (fs.existsSync(path.join(commonDir, ".messaging-global-config.json"))) {
        const raw = JSON.parse(
          fs.readFileSync(path.join(commonDir, ".messaging-global-config.json"), "utf-8")
        );
        expect(raw.post_create_hook).toBeUndefined();
      }
    });
  });
});
