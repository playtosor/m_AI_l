import fs from "fs";
import path from "path";

import { writeFileAtomic } from "./fs-atomic";
import { COMMON_ROOT } from "../domain/constants";

export interface ActivityLogEntry {
  timestamp: string;
  project: string;
  sender: string;
  recipient: string;
  subject: string;
  sender_project: string;
}

const ACTIVITY_LOG_FILE = "activity.log";
const SUBJECT_MAX_LENGTH = 80;

// Tab-separated format: a tab, CR or LF inside a field would split the entry
// into extra fields / physical lines and break the TSV field contract.
const FIELD_SEPARATOR_PATTERN = /[\t\r\n]/g;

function flattenField(value: string): string {
  return value.replace(FIELD_SEPARATOR_PATTERN, " ");
}

/**
 * Absolute path of the cross-project activity log, kept under COMMON_ROOT so
 * every project writes to the same feed consumed by the console.
 */
export function getActivityLogPath(): string {
  return path.join(COMMON_ROOT, ACTIVITY_LOG_FILE);
}

/**
 * Append a single send event to the activity log (`COMMON_ROOT/activity.log`).
 * One line per event, tab-separated: timestamp \t project \t sender \t
 * recipient \t subject \t sender_project. `project` is the RECIPIENT's project
 * (the mailbox host); `sender_project` is the SENDER's origin project. Tabs/CR/
 * LF are flattened in every field, and the subject is truncated to 80 chars.
 *
 * Backward compatible: `sender_project` is the last field, so lines written by
 * older versions (5 fields) still parse — readers that take the first five
 * fields keep working.
 *
 * Best-effort (D6): any failure is swallowed and reported as a warning — the
 * caller's send must never fail because the log could not be written.
 *
 * Concurrency (D5): the line lands through a single `O_APPEND` write, so each
 * entry is committed atomically at end-of-file and concurrent writers cannot
 * interleave or lose lines.
 */
export function appendActivityLog(entry: ActivityLogEntry): void {
  const logPath = getActivityLogPath();
  const line =
    [
      flattenField(entry.timestamp),
      flattenField(entry.project),
      flattenField(entry.sender),
      flattenField(entry.recipient),
      flattenField(entry.subject).substring(0, SUBJECT_MAX_LENGTH),
      flattenField(entry.sender_project),
    ].join("\t") + "\n";

  try {
    fs.appendFileSync(logPath, line, "utf-8");
  } catch (error) {
    console.warn(`[activity-log] Failed to append: ${error}`);
  }
}

/**
 * Drop activity-log entries older than `retentionDays` (D4 — same retention
 * window as the mailbox prune). Best-effort: failures are warned, never
 * thrown. `dryRun` leaves the log untouched. A line whose leading timestamp
 * cannot be parsed is KEPT — a foreign or partial line is never silently
 * destroyed by retention.
 */
export function pruneActivityLog(retentionDays: number, dryRun: boolean): void {
  const logPath = getActivityLogPath();
  if (!fs.existsSync(logPath) || dryRun) {
    return;
  }

  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
    const kept = lines.filter(line => {
      const timestamp = new Date(line.split("\t")[0]).getTime();
      return Number.isNaN(timestamp) || timestamp >= cutoff;
    });

    if (kept.length === lines.length) {
      return;
    }

    writeFileAtomic(logPath, kept.length > 0 ? `${kept.join("\n")}\n` : "");
  } catch (error) {
    console.warn(`[activity-log] Failed to prune: ${error}`);
  }
}
