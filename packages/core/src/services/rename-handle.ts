import { resolveMemberPaths, resolveMemberPathsForNewHandle } from "./member-paths";
import { withMultiLock } from "../lib/lock";
import { writeFileAtomic } from "../lib/fs-atomic";
import { mutateRosterLine, snapshotIfExists, unlinkIfExists } from "../lib/roster-utils";
import { handlesEqual, normalizeHandle } from "../lib/handles";
import { findRosterEntry } from "./mail-routing";
import { getRoster } from "../repositories/roster-repo";
import { RosterEntryNotFoundError, RosterEntryExistsError } from "../domain/errors";
import { RosterEntry } from "../domain/types";
import fs from "fs";

export interface RenameHandleInput {
  project_handle: string;
  old_handle: string;
  new_handle: string;
}

export interface RenameHandleResult {
  status: "renamed";
  project_handle: string;
  old_handle: string;
  new_handle: string;
}

/**
 * Renames a handle across roster and the 3 mailbox files.
 *
 * ⚠ Per ARCHI/CHEF decision (V2.6):
 *   References to `old_handle` already present inside other members' mailbox
 *   headers or message bodies are NOT updated. They are left as historical
 *   artefacts. Same convention applies to `deleteHandle`.
 *
 * Concurrency: locks roster.md, old_* and new_* paths, in alphabetical
 * order to avoid deadlocks across concurrent admin operations.
 *
 * Transactional: if any step after validation fails, restores roster + the
 * 3 files of both old and new handles to their pre-operation state.
 */
export function renameHandle(input: RenameHandleInput): RenameHandleResult {
  const { project_handle, old_handle, new_handle } = input;

  if (handlesEqual(old_handle, new_handle)) {
    throw new Error(`renameHandle: old_handle and new_handle are identical (${old_handle}).`);
  }

  const oldPaths = resolveMemberPaths(project_handle, old_handle);
  const newPaths = resolveMemberPathsForNewHandle(project_handle, new_handle);

  const lockTargets = [
    oldPaths.roster_path,
    oldPaths.archive_path,
    oldPaths.mailbox_path,
    oldPaths.outbox_path,
    newPaths.archive_path,
    newPaths.mailbox_path,
    newPaths.outbox_path,
  ]
    .slice()
    .sort();

  withMultiLock(lockTargets, "rename_handle", () =>
    performRename(oldPaths, newPaths, old_handle, new_handle)
  );

  return { status: "renamed", project_handle, old_handle, new_handle };
}

function performRename(
  oldPaths: ReturnType<typeof resolveMemberPaths>,
  newPaths: ReturnType<typeof resolveMemberPathsForNewHandle>,
  oldHandleRaw: string,
  newHandleRaw: string
): void {
  // V2.11: normalize handles to UPPERCASE for storage and path derivation.
  const oldHandle = normalizeHandle(oldHandleRaw);
  const newHandle = normalizeHandle(newHandleRaw);
  // Snapshots for rollback.
  const rosterBackup = fs.readFileSync(oldPaths.roster_path, "utf-8");
  const oldMailboxBackup = snapshotIfExists(oldPaths.mailbox_path);
  const oldArchiveBackup = snapshotIfExists(oldPaths.archive_path);
  const oldOutboxBackup = snapshotIfExists(oldPaths.outbox_path);
  const newMailboxBackup = snapshotIfExists(newPaths.mailbox_path);
  const newArchiveBackup = snapshotIfExists(newPaths.archive_path);
  const newOutboxBackup = snapshotIfExists(newPaths.outbox_path);

  // Validation: old must exist, new must NOT exist. V2.12: reuse the shared
  // `findRosterEntry(roster, handle)` from mail-routing instead of a local
  // file-path-flavoured duplicate. Loading the roster once via the repository
  // keeps the canonical markdown parser on the same code path as the rest of
  // the codebase.
  const roster = getRoster(oldPaths.project_path, oldPaths.roster_path);
  const oldEntry = findRosterEntry(roster, oldHandle);
  if (!oldEntry) {
    throw new RosterEntryNotFoundError(oldHandle);
  }
  if (findRosterEntry(roster, newHandle)) {
    throw new RosterEntryExistsError(newHandle);
  }

  // Track which new_* files were created by us so rollback can clean them.
  const createdNewFiles = {
    mailbox: false,
    archive: false,
    outbox: false,
  };

  try {
    // 1. Migrate mailbox files. Use "" fallback if source was missing so
    //    the target is created in a valid empty state.
    migrateNewFile(newPaths.mailbox_path, oldMailboxBackup, createdNewFiles, "mailbox");
    migrateNewFile(newPaths.archive_path, oldArchiveBackup, createdNewFiles, "archive");
    migrateNewFile(newPaths.outbox_path, oldOutboxBackup, createdNewFiles, "outbox");

    // 2. Apply roster mutation atomically: drop old, insert new (same props).
    applyRosterRename(oldPaths.roster_path, oldHandle, newHandle, oldEntry);

    // 3. Drop the old mailbox files now that new_* are in place.
    unlinkIfExists(oldPaths.mailbox_path);
    unlinkIfExists(oldPaths.archive_path);
    unlinkIfExists(oldPaths.outbox_path);
  } catch (error) {
    rollbackRename(
      oldPaths,
      newPaths,
      { mailboxBackup: oldMailboxBackup, archiveBackup: oldArchiveBackup, outboxBackup: oldOutboxBackup },
      { rosterBackup, mailboxBackup: newMailboxBackup, archiveBackup: newArchiveBackup, outboxBackup: newOutboxBackup },
      createdNewFiles
    );
    throw error;
  }
}

function applyRosterRename(
  rosterPath: string,
  oldHandle: string,
  newHandle: string,
  sourceEntry: RosterEntry
): void {
  mutateRosterLine(rosterPath, oldHandle, {
    type: "replace",
    buildLine: (parts) => {
      const newMailbox = transformMailboxPath(parts[2], oldHandle, newHandle);
      return `| ${newHandle} | ${sourceEntry.role} | ${newMailbox} | ${sourceEntry.status} |`;
    },
  });
}

function transformMailboxPath(value: string, oldHandle: string, newHandle: string): string {
  const mailboxFile = `mailbox_${oldHandle}.md`;
  const archiveFile = `mailbox_${oldHandle}_archive.md`;
  const outboxFile = `outbox_${oldHandle}.md`;

  if (value === mailboxFile) return `mailbox_${newHandle}.md`;
  if (value === archiveFile) return `mailbox_${newHandle}_archive.md`;
  if (value === outboxFile) return `outbox_${newHandle}.md`;

  // Some rosters store an absolute path; map each segment.
  // Use simple string replacement (handles are [A-Z0-9_] after normalizeHandle,
  // so regex interpolation is safe, but string replace is simpler and faster).
  return value
    .replace(`mailbox_${oldHandle}_archive.md`, `mailbox_${newHandle}_archive.md`)
    .replace(`mailbox_${oldHandle}.md`, `mailbox_${newHandle}.md`)
    .replace(`outbox_${oldHandle}.md`, `outbox_${newHandle}.md`);
}

interface CreatedTracker {
  mailbox: boolean;
  archive: boolean;
  outbox: boolean;
}

function migrateNewFile(
  dstPath: string,
  backup: string | null,
  tracker: CreatedTracker,
  key: "mailbox" | "archive" | "outbox"
): void {
  writeFileAtomic(dstPath, backup ?? "<!-- END -->\n");
  tracker[key] = true;
}

interface OldFilesBundle {
  mailboxBackup: string | null;
  archiveBackup: string | null;
  outboxBackup: string | null;
}

interface NewFilesBundle {
  rosterBackup: string;
  mailboxBackup: string | null;
  archiveBackup: string | null;
  outboxBackup: string | null;
}

function rollbackRename(
  oldPaths: ReturnType<typeof resolveMemberPaths>,
  newPaths: ReturnType<typeof resolveMemberPaths>,
  oldFiles: OldFilesBundle,
  newFiles: NewFilesBundle,
  createdNewFiles: CreatedTracker
): void {
  // Rewind new_* files: delete if we created them, otherwise restore.
  if (createdNewFiles.mailbox) {
    if (fs.existsSync(newPaths.mailbox_path)) fs.unlinkSync(newPaths.mailbox_path);
  } else if (newFiles.mailboxBackup !== null) {
    writeFileAtomic(newPaths.mailbox_path, newFiles.mailboxBackup);
  }
  if (createdNewFiles.archive) {
    if (fs.existsSync(newPaths.archive_path)) fs.unlinkSync(newPaths.archive_path);
  } else if (newFiles.archiveBackup !== null) {
    writeFileAtomic(newPaths.archive_path, newFiles.archiveBackup);
  }
  if (createdNewFiles.outbox) {
    if (fs.existsSync(newPaths.outbox_path)) fs.unlinkSync(newPaths.outbox_path);
  } else if (newFiles.outboxBackup !== null) {
    writeFileAtomic(newPaths.outbox_path, newFiles.outboxBackup);
  }

  // Rewind old_* files: restore if we deleted them.
  if (oldFiles.mailboxBackup !== null) {
    writeFileAtomic(oldPaths.mailbox_path, oldFiles.mailboxBackup);
  }
  if (oldFiles.archiveBackup !== null) {
    writeFileAtomic(oldPaths.archive_path, oldFiles.archiveBackup);
  }
  if (oldFiles.outboxBackup !== null) {
    writeFileAtomic(oldPaths.outbox_path, oldFiles.outboxBackup);
  }

  // Restore roster last.
  writeFileAtomic(oldPaths.roster_path, newFiles.rosterBackup);
}
