import { getProject } from "../repositories/projects-repo";
import { getRoster, addRosterEntry, RosterEntry } from "../repositories/roster-repo";
import { UpsertHandleInput, UpsertHandleResult } from "../domain/types";
import { findRosterEntry } from "./mail-routing";
import { initMailboxAtPaths } from "../repositories/mailbox-repo";
import { resolveMailboxPathFromValue, resolveArchivePathFromMailboxPath, resolveOutboxPathFromMailboxPath } from "./mail-routing";
import { mutateRosterLine } from "../lib/roster-utils";
import { normalizeHandle } from "../lib/handles";
import { withFileLock } from "../lib/lock";
import { RosterEntryExistsError } from "../domain/errors";
import { ROSTER_HEADER, DEFAULT_ROSTER_STATUS } from "../domain/constants";
import fs from "fs";
import { writeFileAtomic } from "../lib/fs-atomic";
import path from "path";

/**
 * Create or update a handle in a project's roster.
 * - If the handle doesn't exist, it is created (and mailbox/outbox/archive are initialized).
 * - If the handle exists, its role, mailbox, and status are updated.
 * - If `input.strict === true` and the handle already exists, throws
 *   `RosterEntryExistsError` instead of updating. Use this for "register"
 *   semantics where the caller wants to fail loudly on duplicates.
 *
 * Concurrency (V2.12): the roster existence check, header creation, read,
 * and write are ALL wrapped under a single `withFileLock` keyed on the
 * roster path. Closes the TOCTOU window where two simultaneous callers
 * could each see "no existing entry" (or "no roster file") and both try
 * to create.
 */
export function upsertHandle(input: UpsertHandleInput): UpsertHandleResult {
  const project = getProject(input.project_handle);
  const rosterPath = project.roster || path.join(project.path, "roster.md");
  const normalizedHandle = normalizeHandle(input.handle);

  return withFileLock(rosterPath, "upsert_handle", () => {
    // Ensure roster exists INSIDE the lock (TOCTOU-safe: two concurrent
    // callers cannot both see "missing" and both write the header).
    if (!fs.existsSync(rosterPath)) {
      writeFileAtomic(rosterPath, ROSTER_HEADER);
    }

    const roster = getRoster(project.path, rosterPath);
    const existingEntry = findRosterEntry(roster, normalizedHandle);

    if (!existingEntry) {
      // Create new handle
      const mailbox = input.mailbox || `mailbox_${normalizedHandle}.md`;
      const mailboxPath = resolveMailboxPathFromValue(project.path, normalizedHandle, mailbox);
      const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
      const outboxPath = resolveOutboxPathFromMailboxPath(mailboxPath, normalizedHandle);

      addRosterEntry(project.path, {
        handle: normalizedHandle,
        role: input.role,
        mailbox,
        status: normalizeRosterStatus(input.status) || DEFAULT_ROSTER_STATUS,
      }, rosterPath);

      // Initialize mailbox, archive, outbox
      initMailboxAtPaths(mailboxPath, archivePath, outboxPath);

      return {
        status: "created",
        project_handle: input.project_handle,
        handle: normalizedHandle,
        role: input.role,
        mailbox,
        roster_status: normalizeRosterStatus(input.status) || DEFAULT_ROSTER_STATUS,
      };
    }

    // V3.0 BAC 2A follow-up: strict mode refuses to overwrite an existing entry.
    if (input.strict === true) {
      throw new RosterEntryExistsError(normalizedHandle);
    }

    // Update existing handle. `updatedEntry` already carries the final
    // values (merged from input + existingEntry), so we return it directly
    // instead of re-reading the whole roster from disk.
    const updatedEntry: RosterEntry = {
      handle: normalizedHandle,
      role: input.role || existingEntry.role,
      mailbox: input.mailbox || existingEntry.mailbox,
      status: normalizeRosterStatus(input.status) || existingEntry.status,
    };

    updateRosterEntry(rosterPath, normalizedHandle, updatedEntry);

    return {
      status: "updated",
      project_handle: input.project_handle,
      handle: updatedEntry.handle,
      role: updatedEntry.role,
      mailbox: updatedEntry.mailbox,
      roster_status: updatedEntry.status,
    };
  });
}

function updateRosterEntry(
  rosterPath: string,
  handle: string,
  updatedEntry: RosterEntry
): void {
  mutateRosterLine(rosterPath, handle, {
    type: "replace",
    buildLine: () =>
      `| ${updatedEntry.handle} | ${updatedEntry.role} | ${updatedEntry.mailbox} | ${updatedEntry.status} |`,
  });
}

function normalizeRosterStatus(raw: string | undefined): "active" | "inactive" | undefined {
  if (raw === undefined) return undefined;
  return raw === "inactive" ? "inactive" : "active";
}
