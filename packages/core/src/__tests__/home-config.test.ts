import fs from "fs";
import os from "os";
import path from "path";
import { readHomeConfig } from "../lib/home-config";
import { resolveCommonRoot, resolveProjectRoot } from "../domain/constants";
import { ConfigCorruptionError } from "../domain/errors";

// Lazy resolution (D1/D2/D4): the chain env -> home config -> actionable
// error is re-evaluated on every call. Tests drive both sources through
// env vars and a mocked home dir, never the machine's real config.

const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "home-config-home-"));
const homeConfigPath = path.join(homeDir, ".m_ai_l", "config.json");

const D3_COMMON =
  "COMMON_PATH is not configured. Set the COMMON_PATH environment variable in your MCP client config, or run the ARO skill once to register your common folder.";
const D3_PROJECT =
  "PROJECT_ROOT is not configured. Set the PROJECT_ROOT environment variable in your MCP client config, or run the ARO skill once to register your common folder.";

const originalEnv = {
  COMMON_PATH: process.env.COMMON_PATH,
  PROJECT_ROOT: process.env.PROJECT_ROOT,
};

function writeHomeConfig(content: string): void {
  fs.mkdirSync(path.dirname(homeConfigPath), { recursive: true });
  fs.writeFileSync(homeConfigPath, content, "utf-8");
}

beforeEach(() => {
  delete process.env.COMMON_PATH;
  delete process.env.PROJECT_ROOT;
  jest.spyOn(os, "homedir").mockReturnValue(homeDir);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (fs.existsSync(homeConfigPath)) fs.rmSync(path.dirname(homeConfigPath), { recursive: true, force: true });
  if (originalEnv.COMMON_PATH !== undefined) process.env.COMMON_PATH = originalEnv.COMMON_PATH;
  if (originalEnv.PROJECT_ROOT !== undefined) process.env.PROJECT_ROOT = originalEnv.PROJECT_ROOT;
});

describe("readHomeConfig", () => {
  it("returns {} when the file is missing", () => {
    expect(readHomeConfig()).toEqual({});
  });

  it("parses commonPath and projectRoot when present", () => {
    writeHomeConfig(JSON.stringify({ commonPath: "C:\\dev\\common", projectRoot: "C:\\dev\\proj" }));
    expect(readHomeConfig()).toEqual({ commonPath: "C:\\dev\\common", projectRoot: "C:\\dev\\proj" });
  });

  it("throws ConfigCorruptionError on invalid JSON (D7)", () => {
    writeHomeConfig("{ not json");
    expect(() => readHomeConfig()).toThrow(ConfigCorruptionError);
  });

  it("throws ConfigCorruptionError on non-object JSON (D7)", () => {
    writeHomeConfig("[1,2]");
    expect(() => readHomeConfig()).toThrow(ConfigCorruptionError);
  });

  it("throws ConfigCorruptionError on non-string commonPath (D7)", () => {
    writeHomeConfig(JSON.stringify({ commonPath: 42 }));
    expect(() => readHomeConfig()).toThrow(ConfigCorruptionError);
  });

  it("throws ConfigCorruptionError on non-string projectRoot (D7)", () => {
    writeHomeConfig(JSON.stringify({ projectRoot: true }));
    expect(() => readHomeConfig()).toThrow(ConfigCorruptionError);
  });
});

describe("resolveCommonRoot", () => {
  it("returns COMMON_PATH env when set (env wins over home config)", () => {
    writeHomeConfig(JSON.stringify({ commonPath: "C:\\home\\common" }));
    process.env.COMMON_PATH = "C:\\env\\common";
    expect(resolveCommonRoot()).toBe("C:\\env\\common");
  });

  it("falls back to home config when env is unset", () => {
    writeHomeConfig(JSON.stringify({ commonPath: "C:\\home\\common" }));
    expect(resolveCommonRoot()).toBe("C:\\home\\common");
  });

  it("throws the D3 error when neither env nor home config provide a path", () => {
    expect(() => resolveCommonRoot()).toThrow(D3_COMMON);
  });

  it("treats an empty-string commonPath as not configured", () => {
    writeHomeConfig(JSON.stringify({ commonPath: "" }));
    expect(() => resolveCommonRoot()).toThrow(D3_COMMON);
  });

  it("re-resolves on every call: home config written mid-process is picked up (D4)", () => {
    expect(() => resolveCommonRoot()).toThrow(D3_COMMON);
    writeHomeConfig(JSON.stringify({ commonPath: "C:\\late\\common" }));
    expect(resolveCommonRoot()).toBe("C:\\late\\common");
  });
});

describe("resolveProjectRoot", () => {
  it("returns PROJECT_ROOT env when set (env wins over home config)", () => {
    writeHomeConfig(JSON.stringify({ projectRoot: "C:\\home\\proj" }));
    process.env.PROJECT_ROOT = "C:\\env\\proj";
    expect(resolveProjectRoot()).toBe("C:\\env\\proj");
  });

  it("falls back to home config when env is unset", () => {
    writeHomeConfig(JSON.stringify({ projectRoot: "C:\\home\\proj" }));
    expect(resolveProjectRoot()).toBe("C:\\home\\proj");
  });

  it("throws the D3-analog error when neither source provides a path", () => {
    expect(() => resolveProjectRoot()).toThrow(D3_PROJECT);
  });
});
