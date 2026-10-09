import { RosterEntry } from "../domain/types";
import { RosterEntryInactiveError, RosterEntryNotFoundError, FileOperationError } from "../domain/errors";
import { COMMON_ROOT } from "../domain/constants";
import { getProjects } from "../repositories/projects-repo";
import { isProjectActive } from "../lib/project-status";
import { handlesEqual, normalizeHandle } from "../lib/handles";
import path from "path";

export function sanitizeMessageField(value: string): string {
  return value.replace(/<!-- END -->/g, "(((END)))");
}

/**
 * Valide qu'un chemin absolu est sous COMMON_ROOT ou un projet actif.
 * @throws FileOperationError si le chemin n'est pas autorisé
 */
export function validateAbsoluteMailboxPath(mailboxPath: string): void {
  const normalizedPath = path.resolve(mailboxPath).toLowerCase();

  // Vérifier sous COMMON_ROOT
  const commonRoot = path.resolve(COMMON_ROOT).toLowerCase();
  if (normalizedPath.startsWith(commonRoot + path.sep)) {
    return; // OK
  }

  // Vérifier sous chaque projet actif
  const projects = getProjects().filter(isProjectActive);
  for (const project of projects) {
    const projectRoot = path.resolve(project.path).toLowerCase();
    if (normalizedPath.startsWith(projectRoot + path.sep)) {
      return; // OK
    }
  }

  throw new FileOperationError(
    `Absolute mailbox path must be under COMMON_ROOT or an active project: ${mailboxPath}`
  );
}

export function resolveMailboxPathFromValue(projectPath: string, handle: string, mailboxValue: string): string {
  if (path.isAbsolute(mailboxValue)) {
    validateAbsoluteMailboxPath(mailboxValue);
    return mailboxValue;
  }

  // V2.5 SIMPLIFY WS3 (option B, fail-fast before join):
  // reject directory traversal in relative mailbox values. Without this,
  // `mailboxValue: "../../secret.txt"` would escape projectPath after
  // `path.join` and resolve outside any allowed scope. Strict rejection
  // up-front strengthens security (no post-join resolution path to abuse)
  // and keeps `getProjects()` cold — preserving the existing test mock surface.
  //
  // DEV from brief: the proposed second guard (reject *any* path separators
  // including legitimate subdirectories like `custom_dir/mailbox_BETA.md`)
  // would break the rename-handle fixture covering the documented
  // subdirectory mailbox use case. Per L-006 (don't break back-compat
  // without explicit brief authorization), we keep single-segment files
  // and `subdir/file.md` allowed; only the `..` segment is rejected.
  if (mailboxValue.includes("..")) {
    throw new FileOperationError(
      `Relative mailbox path cannot contain '..' segments: ${mailboxValue}`
    );
  }
  return path.join(projectPath, mailboxValue);
}

export function resolveArchivePathFromMailboxPath(mailboxPath: string): string {
  const parsed = path.parse(mailboxPath);
  return path.join(parsed.dir, `${parsed.name}_archive${parsed.ext}`);
}

export function resolveOutboxPathFromMailboxPath(mailboxPath: string, handle: string): string {
  const parsed = path.parse(mailboxPath);
  // V2.12: normalize handle so the path derivation is case-insensitive
  // (matches roster casing). Without this, a caller passing "beta" against
  // a roster entry "BETA" would produce outbox_beta.md on macOS/Linux
  // (case-sensitive FS) and silently miss the canonical mailbox_BETA.md path.
  const normalizedHandle = normalizeHandle(handle);
  const expectedMailboxStem = `mailbox_${normalizedHandle}`;

  if (parsed.name === expectedMailboxStem) {
    return path.join(parsed.dir, `outbox_${normalizedHandle}${parsed.ext}`);
  }

  return path.join(parsed.dir, `outbox_${normalizedHandle}.md`);
}

export function findRosterEntry(roster: RosterEntry[], handle: string): RosterEntry | undefined {
  return roster.find(entry => handlesEqual(entry.handle, handle));
}

/**
 * V3.0 BAC 2A follow-up: case-insensitive existence check for a handle in a
 * roster. Returns true when an entry matches the canonical handle (after
 * `normalizeHandle`), false otherwise. Pure lookup — does not throw on
 * missing roster or unknown handle.
 *
 * Use this when callers need to gate a write on handle presence without
 * paying for the full `findRosterEntry` return value (e.g. UI badges,
 * pre-flight checks before `upsertHandle`).
 */
export function handleExists(roster: RosterEntry[], handle: string): boolean {
  return findRosterEntry(roster, handle) !== undefined;
}

export function resolveMemberMailboxPath(
  projectPath: string,
  roster: RosterEntry[],
  handle: string,
  mailboxOverride?: string
): string {
  if (mailboxOverride) {
    return mailboxOverride;
  }

  const entry = findRosterEntry(roster, handle);
  if (!entry) {
    throw new RosterEntryNotFoundError(handle);
  }

  return resolveMailboxPathFromValue(projectPath, handle, entry.mailbox);
}

export function resolveMemberOutboxPath(
  projectPath: string,
  roster: RosterEntry[],
  handle: string
): string {
  const mailboxPath = resolveMemberMailboxPath(projectPath, roster, handle);
  return resolveOutboxPathFromMailboxPath(mailboxPath, handle);
}

export function assertRecipientIsDeliverable(entry: RosterEntry): void {
  if (entry.status.trim().toLowerCase() === "inactive") {
    throw new RosterEntryInactiveError(entry.handle);
  }
}
