import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import {
  resolveArchivePathFromMailboxPath,
  resolveMemberMailboxPath,
  resolveOutboxPathFromMailboxPath,
} from "./mail-routing";
import { getMailboxPath, getOutboxPath, getRosterPath } from "../lib/paths";

export interface MemberPaths {
  project_path: string;
  roster_path: string;
  mailbox_path: string;
  archive_path: string;
  outbox_path: string;
}

/**
 * Resolves all filesystem paths for a project/handle pair in one place.
 * Validates that the handle exists in the roster and that its mailbox is
 * resolvable (HUMAN mailbox at common root, or relative mailbox via roster
 * entry, etc.). Throws otherwise.
 */
export function resolveMemberPaths(
  projectHandle: string,
  handle: string
): MemberPaths {
  const project = getProject(projectHandle);
  const rosterPath = getRosterPath(project.path, project.roster);
  const roster = getRoster(project.path, project.roster);
  const mailboxPath = resolveMemberMailboxPath(project.path, roster, handle);
  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
  const outboxPath = resolveOutboxPathFromMailboxPath(mailboxPath, handle);

  return {
    project_path: project.path,
    roster_path: rosterPath,
    mailbox_path: mailboxPath,
    archive_path: archivePath,
    outbox_path: outboxPath,
  };
}

/**
 * Resolves filesystem paths for a hypothetical handle using the default
 * convention `mailbox_${handle}.md` under the project root, without
 * checking the roster. Use this when the handle is not yet known to
 * exist (e.g. `renameHandle` validating a candidate `new_handle`).
 *
 * Throws only if the project itself is unknown.
 */
export function resolveMemberPathsForNewHandle(
  projectHandle: string,
  handle: string
): MemberPaths {
  const project = getProject(projectHandle);
  const rosterPath = getRosterPath(project.path, project.roster);
  const mailboxPath = getMailboxPath(project.path, handle);
  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
  const outboxPath = getOutboxPath(project.path, handle);

  return {
    project_path: project.path,
    roster_path: rosterPath,
    mailbox_path: mailboxPath,
    archive_path: archivePath,
    outbox_path: outboxPath,
  };
}
