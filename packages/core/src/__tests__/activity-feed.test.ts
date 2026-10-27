import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "activity-feed-test-"));
const logPath = path.join(tempDir, "activity.log");

// packages/core/src/__tests__ -> packages/mcp/cli
const CLI = path.resolve(__dirname, "../../../mcp/cli/activity-feed.js");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, COMMON_PATH: tempDir },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("activity-feed CLI reader", () => {
  beforeEach(() => {
    fs.rmSync(logPath, { force: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("filters entries by --since", () => {
    fs.writeFileSync(
      logPath,
      "2026-10-15T10:00:00.000Z\tPROJ\tSENDER\tRECIPIENT\told-entry\n" +
        "2026-10-17T10:00:00.000Z\tPROJ\tSENDER\tRECIPIENT\tnew-entry\n"
    );

    const { status, stdout } = runCli(["--since", "2026-10-17T00:00:00Z"]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(1);
    expect(feed[0].subject).toBe("new-entry");
  });

  it("caps output at --limit and returns newest-first", () => {
    const lines = [];
    for (let i = 0; i < 5; i++) {
      lines.push(`2026-10-17T0${i}:00:00.000Z\tPROJ\tSENDER\tRECIPIENT\tm${i}`);
    }
    fs.writeFileSync(logPath, `${lines.join("\n")}\n`);

    const { status, stdout } = runCli(["--limit", "2"]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(2);
    expect(feed[0].subject).toBe("m4");
    expect(feed[1].subject).toBe("m3");
  });

  it("skips malformed lines (too few fields, unparseable timestamp) and returns [] when the log is missing (never crashes)", () => {
    // Best-effort: missing log -> empty array, exit 0.
    const missing = runCli([]);
    expect(missing.status).toBe(0);
    expect(JSON.parse(missing.stdout)).toEqual([]);

    fs.writeFileSync(
      logPath,
      "2026-10-17T10:00:00.000Z\tPROJ\tSENDER\tRECIPIENT\tgood-entry\n" +
        "garbage line with no tabs\n" +
        "not-a-timestamp\tPROJ\tSENDER\tRECIPIENT\tbad-timestamp\n" +
        "2026-10-17T11:00:00.000Z\tPROJ\tSENDER\ttoo-few\n"
    );

    const { status, stdout } = runCli([]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(1);
    expect(feed[0].subject).toBe("good-entry");
  });

  it("skips foreign lines with too many fields (7+) instead of silently dropping columns", () => {
    fs.writeFileSync(
      logPath,
      "2026-10-17T10:00:00.000Z\tPROJ\tSENDER\tRECIPIENT\tok\n" +
        "2026-10-17T12:00:00.000Z\tPROJ\tSENDER\tRECIPIENT\ttoo\tmany\tfields\n"
    );

    const { status, stdout } = runCli([]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(1);
    expect(feed[0].subject).toBe("ok");
  });

  it("exposes sender_project from the 6th field when present", () => {
    fs.writeFileSync(
      logPath,
      "2026-10-17T10:00:00.000Z\tTEST\tMAILEXPORT/ARCHI\tRECIPIENT\tcross\tMAILEXPORT\n"
    );

    const { status, stdout } = runCli([]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(1);
    expect(feed[0].project).toBe("TEST");
    expect(feed[0].sender).toBe("MAILEXPORT/ARCHI");
    expect(feed[0].sender_project).toBe("MAILEXPORT");
  });

  it("derives sender_project when the 6th field is present but empty", () => {
    fs.writeFileSync(
      logPath,
      "2026-10-17T10:00:00.000Z\tTEST\tMAILEXPORT/ARCHI\tRECIPIENT\tcross\t\n"
    );

    const { status, stdout } = runCli([]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(1);
    expect(feed[0].sender_project).toBe("MAILEXPORT"); // empty 6th -> derived prefix
  });

  it("derives sender_project for legacy 5-field lines (qualified prefix, else project field)", () => {
    fs.writeFileSync(
      logPath,
      "2026-10-17T10:00:00.000Z\tTEST\tMAILEXPORT/ARCHI\tRECIPIENT\tcross-qualified\n" +
        "2026-10-17T10:01:00.000Z\tTEST\tARCHI\tRECIPIENT\tintra-bare\n"
    );

    const { status, stdout } = runCli([]);

    expect(status).toBe(0);
    const feed = JSON.parse(stdout);
    expect(feed).toHaveLength(2);
    // Newest-first: the bare-handle line is the most recent.
    expect(feed[0].sender).toBe("ARCHI");
    expect(feed[0].sender_project).toBe("TEST"); // bare handle -> project field
    expect(feed[1].sender).toBe("MAILEXPORT/ARCHI");
    expect(feed[1].sender_project).toBe("MAILEXPORT"); // qualified -> prefix before first "/"
  });
});
