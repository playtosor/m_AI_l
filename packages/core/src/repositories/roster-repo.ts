import { RosterEntry } from "../domain/types";
import { getRosterPath } from "../lib/paths";
import { writeFileAtomic } from "../lib/fs-atomic";
import { FileOperationError, RosterEntryExistsError } from "../domain/errors";
import { parseMarkdownTableRow, isMarkdownSeparatorRow } from "../lib/markdown";
import { handlesEqual, normalizeHandle } from "../lib/handles";
import { ROSTER_HEADER } from "../domain/constants";
import fs from "fs";

export type { RosterEntry } from "../domain/types";
export function getRoster(projectPath: string, rosterOverride?: string): RosterEntry[] {
  return getRosterWithContent(projectPath, rosterOverride).entries;
}

export interface RosterWithContent {
  entries: RosterEntry[];
  rawContent: string;
  rosterPath: string;
  mtimeMs: number;
}

/**
 * Reads the roster file once and returns both the parsed entries and the
 * raw content (plus the absolute path and mtime). Use this when callers
 * need to hash the file (e.g. ETag generation) without paying the cost of
 * a second `fs.readFileSync` after `getRoster()`.
 *
 * Throws `FileOperationError` if the roster file is missing.
 */
export function getRosterWithContent(projectPath: string, rosterOverride?: string): RosterWithContent {
  const rosterPath = getRosterPath(projectPath, rosterOverride);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(rosterPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new FileOperationError(`Roster file not found: ${rosterPath}`);
    }
    throw error;
  }
  const rawContent = fs.readFileSync(rosterPath, "utf-8");

  const lines = rawContent
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "" && line.startsWith("|"))
    .filter(line => !isMarkdownSeparatorRow(line))
    .filter(line => !isRosterHeaderRow(line));

  const entries = lines.map(line => parseRosterEntry(line));

  return { entries, rawContent, rosterPath, mtimeMs: stat.mtimeMs };
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export function addRosterEntry(projectPath: string, entry: RosterEntry, rosterOverride?: string): void {
  const rosterPath = getRosterPath(projectPath, rosterOverride);
  if (!fs.existsSync(rosterPath)) {
    writeFileAtomic(rosterPath, ROSTER_HEADER);
  }
  
  const normalizedHandle = normalizeHandle(entry.handle);
  const existingEntries = getRoster(projectPath, rosterOverride);
  if (existingEntries.some(e => handlesEqual(e.handle, normalizedHandle))) {
    throw new RosterEntryExistsError(normalizedHandle);
  }

  const newEntryLine = `| ${normalizedHandle} | ${entry.role} | ${entry.mailbox} | ${entry.status} |\n`;
  const currentContent = fs.readFileSync(rosterPath, "utf-8");
  // V3.0 BAC 2A follow-up: avoid inserting a blank line when the file
  // already ends with "\n". Strip ALL trailing newlines, then re-add a
  // single one before appending the new entry — guarantees exactly one
  // newline between the previous last line and the new entry.
  const trimmed = currentContent.replace(/\n+$/, "");
  writeFileAtomic(rosterPath, `${trimmed}\n${newEntryLine}`);
}

function parseRosterEntry(line: string): RosterEntry {
  const parts = parseMarkdownTableRow(line);
  if (parts.length !== 4) {
    throw new Error(`Invalid roster entry format: ${line}`);
  }

  return {
    handle: parts[0],
    role: parts[1],
    mailbox: parts[2],
    status: normalizeRosterStatus(parts[3]),
  };
}

function normalizeRosterStatus(raw: string): "active" | "inactive" {
  return raw === "inactive" ? "inactive" : "active";
}

function isRosterHeaderRow(line: string): boolean {
  const parts = parseMarkdownTableRow(line);
  if (parts.length !== 4) {
    return false;
  }

  return (
    parts[0].toLowerCase() === "handle" &&
    parts[1].toLowerCase() === "role" &&
    parts[2].toLowerCase() === "mailbox" &&
    parts[3].toLowerCase() === "status"
  );
}
