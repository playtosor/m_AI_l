/**
 * prune-common — Shared logic for m_AI_l messaging prune.
 *
 * Migrated from scripts/prune_scan.js (V1 reference preserved).
 * TypeScript module importable by admin scripts.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Parse a m_AI_l date string YYYYMMDD-HHMM into a JS Date.
 * Returns null if the string doesn't match.
 */
export function parseMailDate(str: string): Date | null {
  const m = str.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`);
}

/**
 * Compute the cutoff date: today minus retentionDays.
 */
export function getCutoffDate(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

// ─── File scanner ─────────────────────────────────────────────────────────────

/**
 * Returns true if filename is in scope for pruning.
 * Included: mailbox_*_archive.md, outbox_*.md
 * Excluded: mailbox_*.md (active inboxes — no _archive suffix)
 */
export function isInScope(filename: string): boolean {
  if (/^mailbox_.+_archive\.md$/i.test(filename)) return true;
  if (/^outbox_.+\.md$/i.test(filename)) return true;
  return false;
}

export interface EntryHeader {
  lineIndex: number;
  date: Date;
  raw: string;
}

/**
 * Extract all dated entry headers from file content.
 * A header line matches: anything // YYYYMMDD-HHMM // ...
 * Returns array of { lineIndex, date, raw }.
 */
export function extractEntryHeaders(lines: string[]): EntryHeader[] {
  const entries: EntryHeader[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^.+\/\/\s*(\d{8}-\d{4})\s*\/\//);
    if (m) {
      const date = parseMailDate(m[1]);
      if (date) entries.push({ lineIndex: i, date, raw: lines[i] });
    }
  }
  return entries;
}

export interface ScanFileReport {
  filename: string;
  path: string;
  sizeKb: number;
  flagged: string;
  entriesToMove: number | null;
  entriesToKeep: number | null;
  cutoffLineIndex: number | null;
  oldestEntry: string | null;
  newestEntry: string | null;
  message?: string;
  error?: string;
  lines: string[];
}

/**
 * Scan a single file and return a report object.
 */
export function scanFile(filePath: string, cutoffDate: Date): ScanFileReport {
  const stat = fs.statSync(filePath);
  const sizeKb = Math.round(stat.size / 1024 * 10) / 10;
  const filename = path.basename(filePath);

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const entries = extractEntryHeaders(lines);

  // Empty or no dated entries
  if (entries.length === 0) {
    return {
      filename,
      path: filePath,
      sizeKb,
      flagged: "empty",
      entriesToMove: 0,
      entriesToKeep: 0,
      cutoffLineIndex: null,
      oldestEntry: null,
      newestEntry: null,
      lines,
    };
  }

  // Count entries to move (older than cutoff) and to keep
  const toMove = entries.filter(e => e.date < cutoffDate);
  const toKeep = entries.filter(e => e.date >= cutoffDate);

  // Find the line index of the first entry to keep (= cut-off point)
  const firstKeptEntry = toKeep.length > 0 ? toKeep[0] : null;
  const cutoffLineIndex = firstKeptEntry ? firstKeptEntry.lineIndex : null;

  return {
    filename,
    path: filePath,
    sizeKb,
    flagged: toMove.length > 0 ? "has_old_entries" : "clean",
    entriesToMove: toMove.length,
    entriesToKeep: toKeep.length,
    cutoffLineIndex,
    oldestEntry: entries[0]?.raw?.substring(0, 60) ?? null,
    newestEntry: entries[entries.length - 1]?.raw?.substring(0, 60) ?? null,
    lines,
  };
}

export interface ScanProjectReport {
  handle: string;
  path: string;
  files: ScanFileReport[];
  totalToMove: number;
  totalToKeep: number;
  error: string | null;
}

/**
 * Scan all in-scope files in a project directory.
 */
export function scanProject(
  project: { handle: string; path: string },
  cutoffDate: Date
): ScanProjectReport {
  const result: ScanProjectReport = {
    handle: project.handle,
    path: project.path,
    files: [],
    totalToMove: 0,
    totalToKeep: 0,
    error: null,
  };

  if (!fs.existsSync(project.path)) {
    result.error = `Directory not found: ${project.path}`;
    return result;
  }

  let dirEntries: string[];
  try {
    dirEntries = fs.readdirSync(project.path);
  } catch (e) {
    result.error = `Cannot read directory: ${(e as Error).message}`;
    return result;
  }

  for (const filename of dirEntries) {
    if (!isInScope(filename)) continue;
    const filePath = path.join(project.path, filename);
    try {
      const fileReport = scanFile(filePath, cutoffDate);
      result.files.push(fileReport);
      result.totalToMove += fileReport.entriesToMove ?? 0;
      result.totalToKeep += fileReport.entriesToKeep ?? 0;
    } catch (e) {
      result.files.push({
        filename,
        path: filePath,
        sizeKb: 0,
        flagged: "error",
        entriesToMove: null,
        entriesToKeep: null,
        cutoffLineIndex: null,
        oldestEntry: null,
        newestEntry: null,
        error: (e as Error).message,
        lines: [],
      });
    }
  }

  return result;
}
