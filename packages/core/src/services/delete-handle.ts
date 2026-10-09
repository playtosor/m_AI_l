import { resolveMemberPaths } from "./member-paths";
import { withMultiLock } from "../lib/lock";
import { writeFileAtomic } from "../lib/fs-atomic";
import { mutateRosterLine, snapshotIfExists, unlinkIfExists } from "../lib/roster-utils";
import { getRoster } from "../repositories/roster-repo";
import { findRosterEntry } from "./mail-routing";
import { RosterEntryNotFoundError } from "../domain/errors";
import fs from "fs";

export interface DeleteHandleInput {
  project_handle: string;
  handle: string;
}

export interface DeleteHandleResult {
  status: "deleted";
  project_handle: string;
  handle: string;
}

/**
 * Forensically destructive but recoverable rollback is in place: if any step
 * after validation fails, the roster and the 3 message files are restored
 * from in-memory backups (LIFO).
 *
 * ⚠ Per ARCHI/CHEF decision (V2.6):
 *   Messages emitted *by* this handle that are still parked in other members'
 *   mailboxes are NOT cleaned up. References in mailbox headers/bodies of
 *   other handles are left intact: deleting a handle revokes its access, it
 *   does not rewrite history. Same convention applies to `renameHandle`.
 *
 * Concurrency: locks roster.md and the 3 mailbox files in alphabetical
 * order to avoid deadlocks across concurrent admin operations.
 */
export function deleteHandle(input: DeleteHandleInput): DeleteHandleResult {
  const { project_handle, handle } = input;
  const paths = resolveMemberPaths(project_handle, handle);

  withMultiLock(
    [paths.roster_path, paths.archive_path, paths.mailbox_path, paths.outbox_path],
    "delete_handle",
    () => performDelete(paths, handle)
  );

  return { status: "deleted", project_handle, handle };
}

function performDelete(
  paths: ReturnType<typeof resolveMemberPaths>,
  handle: string
): void {
  // Capture backups before any mutation. Snapshot the entire roster file as
  // a string so we can rewrite it byte-for-byte on rollback.
  const rosterBackup = fs.readFileSync(paths.roster_path, "utf-8");

  const mailboxBackup = snapshotIfExists(paths.mailbox_path);
  const archiveBackup = snapshotIfExists(paths.archive_path);
  const outboxBackup = snapshotIfExists(paths.outbox_path);

  try {
    // Validate the handle exists in the roster before mutating anything.
    // Mirrors renameHandle: a missing entry must throw rather than silently
    // no-op while the 3 mailbox files are still unlinked (SIMPLIFY #14).
    const roster = getRoster(paths.project_path, paths.roster_path);
    if (!findRosterEntry(roster, handle)) {
      throw new RosterEntryNotFoundError(handle);
    }
    writeRosterWithout(paths.roster_path, handle);
    unlinkIfExists(paths.mailbox_path);
    unlinkIfExists(paths.archive_path);
    unlinkIfExists(paths.outbox_path);
  } catch (error) {
    // Rollback LIFO: restore files first, then roster.
    rollback(paths, { rosterBackup, mailboxBackup, archiveBackup, outboxBackup });
    throw error;
  }
}

function writeRosterWithout(rosterPath: string, handle: string): void {
  mutateRosterLine(rosterPath, handle, { type: "remove" });
}

interface BackupBundle {
  rosterBackup: string;
  mailboxBackup: string | null;
  archiveBackup: string | null;
  outboxBackup: string | null;
}

function rollback(paths: ReturnType<typeof resolveMemberPaths>, backups: BackupBundle): void {
  if (backups.mailboxBackup !== null) {
    writeFileAtomic(paths.mailbox_path, backups.mailboxBackup);
  } else if (fs.existsSync(paths.mailbox_path)) {
    fs.unlinkSync(paths.mailbox_path);
  }
  if (backups.archiveBackup !== null) {
    writeFileAtomic(paths.archive_path, backups.archiveBackup);
  } else if (fs.existsSync(paths.archive_path)) {
    fs.unlinkSync(paths.archive_path);
  }
  if (backups.outboxBackup !== null) {
    writeFileAtomic(paths.outbox_path, backups.outboxBackup);
  } else if (fs.existsSync(paths.outbox_path)) {
    fs.unlinkSync(paths.outbox_path);
  }
  writeFileAtomic(paths.roster_path, backups.rosterBackup);
}
