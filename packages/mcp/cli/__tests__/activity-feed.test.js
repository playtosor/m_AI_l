"use strict";

// Subprocess tests for the activity-feed CLI resolver (D5 CLI parity):
// env -> home config (~/.m_ai_l/config.json) -> actionable error on stderr.
// Each scenario runs node activity-feed.js with a controlled environment —
// COMMON_PATH removed from the base env, USERPROFILE/HOME pointed at
// controlled tmp dirs — so nothing depends on the machine's real config.

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI_PATH = path.join(__dirname, "..", "activity-feed.js");

const D3_TEXT =
  "COMMON_PATH is not configured. Set the COMMON_PATH environment variable in your MCP client config, or run the ARO skill once to register your common folder.";

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeActivityLog(dir, entry) {
  fs.writeFileSync(path.join(dir, "activity.log"), entry, "utf8");
}

// Base env: no COMMON_PATH, home pointed at a controlled dir.
function childEnv(overrides) {
  const env = { ...process.env };
  delete env.COMMON_PATH;
  delete env.PROJECT_ROOT;
  const home = overrides.homeDir;
  env.USERPROFILE = home;
  env.HOME = home;
  delete overrides.homeDir;
  return { ...env, ...overrides };
}

function runCli(envOverrides, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...(args || [])], {
    env: childEnv(envOverrides),
    encoding: "utf8",
  });
}

const LOG_ENTRY = "2026-11-17T10:00:00.000Z\tPROJ\tA\tB\tTest subject\tORIG\n";

describe("activity-feed CLI — COMMON_PATH resolution chain", () => {
  it("uses COMMON_PATH env when set", () => {
    const envDir = makeTempDir("af-cli-env-");
    const homeDir = makeTempDir("af-cli-home-");
    writeActivityLog(envDir, LOG_ENTRY);
    const r = runCli({ homeDir, COMMON_PATH: envDir });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
    expect(JSON.parse(r.stdout)[0].project).toBe("PROJ");
  });

  it("falls back to the home config when env is unset", () => {
    const homeDir = makeTempDir("af-cli-home2-");
    const commonDir = makeTempDir("af-cli-common-");
    fs.mkdirSync(path.join(homeDir, ".m_ai_l"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".m_ai_l", "config.json"),
      JSON.stringify({ commonPath: commonDir }),
      "utf8"
    );
    writeActivityLog(commonDir, LOG_ENTRY);
    const r = runCli({ homeDir });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(1);
  });

  it("env wins over the home config when both are set", () => {
    const envDir = makeTempDir("af-cli-env2-");
    const homeDir = makeTempDir("af-cli-home3-");
    const commonDir = makeTempDir("af-cli-common2-");
    fs.mkdirSync(path.join(homeDir, ".m_ai_l"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".m_ai_l", "config.json"),
      JSON.stringify({ commonPath: commonDir }),
      "utf8"
    );
    writeActivityLog(envDir, "2026-11-17T10:00:00.000Z\tENVPROJ\tA\tB\tEnv subject\tORIG\n");
    writeActivityLog(commonDir, "2026-11-17T10:00:00.000Z\tHOMEPROJ\tA\tB\tHome subject\tORIG\n");
    const r = runCli({ homeDir, COMMON_PATH: envDir });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)[0].project).toBe("ENVPROJ");
  });

  it("exits 1 with the D3 error on stderr when nothing is configured", () => {
    const homeDir = makeTempDir("af-cli-empty-");
    const r = runCli({ homeDir });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(D3_TEXT);
  });

  it("exits 1 with a corrupt-config error on stderr when the home config is malformed (D7)", () => {
    const homeDir = makeTempDir("af-cli-corrupt-");
    fs.mkdirSync(path.join(homeDir, ".m_ai_l"), { recursive: true });
    fs.writeFileSync(path.join(homeDir, ".m_ai_l", "config.json"), "{ not json", "utf8");
    const r = runCli({ homeDir });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Corrupt home config at");
  });

  it("re-attempts resolution per run: a config written after a failed run is picked up (D4)", () => {
    const homeDir = makeTempDir("af-cli-lazy-");
    const first = runCli({ homeDir });
    expect(first.status).toBe(1);
    expect(first.stderr).toContain(D3_TEXT);

    const commonDir = makeTempDir("af-cli-late-");
    fs.mkdirSync(path.join(homeDir, ".m_ai_l"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".m_ai_l", "config.json"),
      JSON.stringify({ commonPath: commonDir }),
      "utf8"
    );
    writeActivityLog(commonDir, LOG_ENTRY);
    const second = runCli({ homeDir });
    expect(second.status).toBe(0);
    expect(JSON.parse(second.stdout)).toHaveLength(1);
  });
});

// Regression (PRE-V1): an explicit process.exit(0) right after stdout.write
// can truncate a large feed when stdout is a pipe (async on macOS); natural
// exit via process.exitCode lets the pending write drain.
describe("activity-feed CLI — large payload is not truncated", () => {
  it("flushes the whole feed (--limit 500) through a stdout pipe and exits 0", () => {
    const commonDir = makeTempDir("af-cli-big-");
    const homeDir = makeTempDir("af-cli-big-home-");
    const LINE_COUNT = 500;
    const SUBJECT = "x".repeat(200);
    let log = "";
    for (let i = 0; i < LINE_COUNT; i++) {
      log += `2026-11-17T10:00:00.000Z\tBIGPROJ\tSENDER\tRECIPIENT\t${SUBJECT}${i}\tORIG\n`;
    }
    writeActivityLog(commonDir, log);
    const r = runCli({ homeDir, COMMON_PATH: commonDir }, ["--limit", "500"]);
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(40000);
    const feed = JSON.parse(r.stdout);
    expect(feed).toHaveLength(LINE_COUNT);
    expect(feed[0].subject).toContain(SUBJECT);
  });
});
