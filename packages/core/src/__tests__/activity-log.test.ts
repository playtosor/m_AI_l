import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "activity-log-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "activity-log-common-"));
const rosterFile = path.join(tempDir, "roster.md");

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

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({ name: "TEST", path: tempDir, roster: rosterFile, status: "active" }),
  getProjects: () => [{ name: "TEST", path: tempDir, roster: rosterFile, status: "active" }],
}));

import { appendActivityLog, getActivityLogPath } from "../lib/activity-log";
import { writeMail } from "../services/write-mail";
import { initMailbox } from "../repositories/mailbox-repo";
import { adminPruneMessaging } from "../admin/prune-messaging";

const ACTIVITY_LOG = getActivityLogPath();

function clearDir(dir: string): void {
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

describe("activity-log", () => {
  beforeEach(() => {
    clearDir(tempDir);
    clearDir(commonDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(commonDir, { recursive: true, force: true });
  });

  it("appends one tab-separated line per send (6 fields, flattened + subject truncated)", () => {
    appendActivityLog({
      timestamp: "2026-10-16T10:00:00.000Z",
      project: "MAILEXPORT",
      sender: "EXEC",
      recipient: "REVIEWER",
      subject: "x".repeat(120),
      sender_project: "MAILEXPORT",
    });
    appendActivityLog({
      timestamp: "2026-10-16T10:01:00.000Z",
      project: "MAILEXPORT",
      sender: "OTHER/EXEC",
      recipient: "CHEF",
      subject: "line1\nline2",
      sender_project: "OTHER",
    });
    // Hostile subject AND sender_project: an embedded tab / CR must not split
    // the entry into extra fields or physical lines.
    appendActivityLog({
      timestamp: "2026-10-16T10:02:00.000Z",
      project: "MAILEXPORT",
      sender: "EXEC",
      recipient: "REVIEWER",
      subject: "a\tb\rc",
      sender_project: "o\tp\rq",
    });

    const lines = fs.readFileSync(ACTIVITY_LOG, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);

    const first = lines[0].split("\t");
    expect(first).toHaveLength(6);
    expect(first.slice(0, 4)).toEqual([
      "2026-10-16T10:00:00.000Z",
      "MAILEXPORT",
      "EXEC",
      "REVIEWER",
    ]);
    expect(first[4]).toHaveLength(80);
    expect(first[5]).toBe("MAILEXPORT");

    // The embedded newline is flattened — the entry stays one physical line.
    const second = lines[1].split("\t");
    expect(second).toHaveLength(6);
    expect(second[4]).toBe("line1 line2");
    expect(second[5]).toBe("OTHER");

    // The tab / CR are flattened — still exactly 6 fields.
    const third = lines[2].split("\t");
    expect(third).toHaveLength(6);
    expect(third[4]).toBe("a b c");
    expect(third[5]).toBe("o p q");
  });

  it("records distinct recipient project and sender project for a cross-project send", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
        "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    initMailbox(tempDir, "RECIPIENT");

    // Recipient project = TEST; the sender originates from MAILEXPORT.
    writeMail("TEST", "ARCHI", "RECIPIENT", "M", "Cross", "Body", undefined, "MAILEXPORT");

    const fields = fs
      .readFileSync(ACTIVITY_LOG, "utf8")
      .split("\n")
      .filter(Boolean)[0]
      .split("\t");
    expect(fields).toHaveLength(6);
    expect(fields[1]).toBe("TEST"); // project = recipient's project
    expect(fields[2]).toBe("MAILEXPORT/ARCHI"); // qualified sender
    expect(fields[5]).toBe("MAILEXPORT"); // sender_project = origin project
    expect(fields[1]).not.toBe(fields[5]);
  });

  it("derives sender_project from a qualified sender when senderProjectHandle is absent", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
        "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
    );
    initMailbox(tempDir, "SENDER");
    initMailbox(tempDir, "RECIPIENT");

    // Handover-style path: no senderProjectHandle, but the sender is qualified.
    writeMail("TEST", "AUTREPROJ/AGENT", "RECIPIENT", "H", "Handover", "Body");

    const fields = fs
      .readFileSync(ACTIVITY_LOG, "utf8")
      .split("\n")
      .filter(Boolean)[0]
      .split("\t");
    expect(fields).toHaveLength(6);
    expect(fields[1]).toBe("TEST"); // project = recipient's project
    expect(fields[2]).toBe("AUTREPROJ/AGENT"); // sender preserved
    expect(fields[5]).toBe("AUTREPROJ"); // sender_project = qualified prefix
  });

  it("still delivers the message when the activity log cannot be written (best-effort)", () => {
    // Force the log write to fail: a directory cannot be read/written as a file.
    fs.mkdirSync(ACTIVITY_LOG, { recursive: true });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      fs.writeFileSync(
        rosterFile,
        "| Handle | Role | Mailbox | Status |\n" +
          "|--------|------|---------|--------|\n" +
          "| SENDER | Sender Role | mailbox_SENDER.md | active |\n" +
          "| RECIPIENT | Recipient Role | mailbox_RECIPIENT.md | active |\n"
      );
      initMailbox(tempDir, "SENDER");
      initMailbox(tempDir, "RECIPIENT");

      const result = writeMail("TEST", "SENDER", "RECIPIENT", "H", "Subject", "Body");

      expect(result.effectiveSender).toBe("SENDER");
      expect(fs.readFileSync(path.join(tempDir, "mailbox_RECIPIENT.md"), "utf8")).toContain("Body");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[activity-log]"));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("prunes entries older than retention_days and honours dry_run", () => {
    const oldTs = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recentTs = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(
      ACTIVITY_LOG,
      `${oldTs}\tMAILEXPORT\tEXEC\tREVIEWER\told-entry\n` +
        `${recentTs}\tMAILEXPORT\tEXEC\tREVIEWER\trecent-entry\n` +
        `not-a-timestamp\tMAILEXPORT\tEXEC\tREVIEWER\tjunk-entry\n`
    );

    // dry_run must not mutate the log.
    adminPruneMessaging({ dry_run: true, retention_days: 30, project_handle: "TEST" });
    expect(fs.readFileSync(ACTIVITY_LOG, "utf8")).toContain("old-entry");

    // A real run drops the stale entry; the recent and the unparseable lines stay.
    adminPruneMessaging({ dry_run: false, retention_days: 30, project_handle: "TEST" });
    const content = fs.readFileSync(ACTIVITY_LOG, "utf8");
    expect(content).not.toContain("old-entry");
    expect(content).toContain("recent-entry");
    expect(content).toContain("junk-entry");
  });
});
