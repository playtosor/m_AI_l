import { COMMON_ROOT, HUMAN_HANDLE } from "../domain/constants";
import { getRosterPath } from "./paths";
import { writeFileAtomic } from "./fs-atomic";
import { isMarkdownSeparatorRow, parseMarkdownTableRow } from "./markdown";
import { handlesEqual } from "./handles";
import fs from "fs";
import path from "path";

/**
 * Canonical location for the cross-project HUMAN mailbox. Routed under
 * COMMON_ROOT so any project can write to / read from HUMAN without needing
 * its own physical mailbox file.
 */
export function getHumanMailboxAbsolutePath(): string {
  return path.join(COMMON_ROOT, "mailbox_HUMAN.md");
}

/**
 * Canonical HUMAN roster entry line. Uses an absolute mailbox path so that
 * any project whose roster holds this entry resolves to the same physical
 * file regardless of `project_path`.
 */
export const HUMAN_ROSTER_LINE =
  `| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`;

/**
 * Ensures the HUMAN entry is present in a project's roster. Idempotent:
 * if HUMAN is already there (exact-match against the canonical absolute
 * mailbox path), the file is left unchanged. Returns true when the entry
 * was added or rewritten from a legacy relative `mailbox_HUMAN.md` row.
 *
 * Callers: `bootstrapCommonMessaging` (one-shot migration of every existing
 * project) and `createMessagingProject` (every new admin-created project
 * carries HUMAN from day one). Direct `init-mail` callers must add HUMAN
 * explicitly. Replacing the cross-project special-case in
 * `mail-routing.ts` (V2.9) means every project must list HUMAN explicitly;
 * this helper centralizes that policy.
 *
 * Concurrency: this helper does NOT acquire `withFileLock`. The roster file
 * is treated as single-writer / single-reader. The two callers above both
 * are admin entry points that wrap their own locks (or run during a
 * `bootstrap` one-shot where contention is acceptable). Concurrent writes
 * from multiple admins may race; the worst case is a transient TOCTOU
 * producing a slightly stale canonical entry, which the next call will
 * re-converge. No data is lost.
 *
 * TOCTOU: the file is read with `fs.existsSync` followed by `readFileSync`.
 * If the file is deleted between the two calls, ensureHumanInRoster returns
 * `false` (no-op). That's acceptable for admin bootstrap, where the caller
 * (or a subsequent call) is responsible for ensuring the roster exists.
 *
 * Idempotence: re-running on the same roster is safe and converges to the
 * canonical entry. A legacy `mailbox_HUMAN.md` (relative) line is rewritten
 * to the canonical absolute-path variant.
 */
export function ensureHumanInRoster(projectPath: string, rosterOverride?: string): boolean {
  const rosterPath = getRosterPath(projectPath, rosterOverride);
  if (!fs.existsSync(rosterPath)) {
    // Nothing to update if the roster itself doesn't exist yet. `init-mail`
    // is responsible for creating it, then may call this helper afterwards.
    return false;
  }

  const content = fs.readFileSync(rosterPath, "utf-8");
  const lines = content.split("\n");

  let humanLineIndex = -1;
  let hasCanonicalHuman = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) continue;
    if (isMarkdownSeparatorRow(line)) continue;
    const cells = parseMarkdownTableRow(line);
    if (cells[0] === HUMAN_HANDLE) {
      humanLineIndex = i;
      if (cells[2] === getHumanMailboxAbsolutePath() && cells[3] === "active") {
        hasCanonicalHuman = true;
        break;
      }
    }
  }

  if (hasCanonicalHuman) {
    return false;
  }

  if (humanLineIndex >= 0) {
    // Replace legacy HUMAN line (mailbox_HUMAN.md relative) with canonical absolute path.
    lines[humanLineIndex] = HUMAN_ROSTER_LINE;
  } else {
    lines.push(HUMAN_ROSTER_LINE);
  }

  writeFileAtomic(rosterPath, lines.join("\n"));
  return true;
}

export type RosterMutation =
  | { type: "replace"; buildLine: (parts: string[]) => string }
  | { type: "remove" };

/**
 * Single roster-mutation primitive shared by upsert/rename/delete-handle.
 *
 * Reads the roster and, for the row whose first cell matches `handle`
 * (case-insensitive, per `handlesEqual`), either replaces it with
 * `buildLine(parts)` or removes it. Every other row (header, separator,
 * empty, non-matching) is kept verbatim. The file is rewritten atomically,
 * preserving the original trailing-newline shape: `split("\n")` on a file
 * ending in "\n" yields a trailing "" element that `join("\n")` restores.
 *
 * No-op guard: if no row matches `handle`, the function returns WITHOUT
 * rewriting. The file is left byte-identical (content AND mtime unchanged),
 * which is the desired behaviour for callers that may target an absent row.
 *
 * NOTE: the brief's draft used `lines.filter(... return action.buildLine(parts))`
 * for the replace branch — but `Array.prototype.filter` keeps the ORIGINAL
 * element when the predicate is truthy, so the new line would have been
 * discarded and the roster left unchanged. This implementation uses
 * `map` + `filter(null)` so the matching row is actually replaced, producing
 * byte-identical output to the three original per-service parsers.
 */
export function mutateRosterLine(rosterPath: string, handle: string, action: RosterMutation): void {
  const content = fs.readFileSync(rosterPath, "utf-8");
  const lines = content.split("\n");
  let matched = false;
  const updated = lines
    .map((line) => {
      const parts = parseMarkdownTableRow(line);
      const isMatch = parts.length > 0 && handlesEqual(parts[0], handle);
      if (!isMatch) return line;
      matched = true;
      if (action.type === "remove") return null;
      return action.buildLine(parts);
    })
    .filter((line): line is string => line !== null);
  if (!matched) return;
  writeFileAtomic(rosterPath, updated.join("\n"));
}

/**
 * Read a file if it exists, returning its contents, or `null` otherwise.
 * Shared by delete-handle and rename-handle so the snapshot/restore logic
 * lives in one place (finding #2).
 */
export function snapshotIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
}

/**
 * Delete a file if it exists. No-op when the path is absent.
 * Shared by delete-handle and rename-handle (finding #2).
 */
export function unlinkIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
