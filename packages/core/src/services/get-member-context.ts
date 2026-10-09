import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { MemberContext } from "../domain/types";
import { RosterEntryNotFoundError } from "../domain/errors";
import { HUMAN_HANDLE } from "../domain/constants";
import {
  findRosterEntry,
  resolveArchivePathFromMailboxPath,
  resolveMemberMailboxPath,
  resolveMemberOutboxPath,
} from "./mail-routing";

export function getMemberContextService(projectHandle: string, handle: string): MemberContext {
  const project = getProject(projectHandle);
  const roster = getRoster(project.path, project.roster);
  const entry = findRosterEntry(roster, handle);

  if (!entry) {
    throw new RosterEntryNotFoundError(handle);
  }

  const resolvedMailbox = resolveMemberMailboxPath(project.path, roster, handle);

  return {
    project_handle: project.name,
    project_path: project.path,
    project_language: project.language,
    handle: entry.handle,
    role: entry.role,
    status: entry.status,
    mailbox: entry.mailbox,
    resolved_mailbox: resolvedMailbox,
    resolved_archive: resolveArchivePathFromMailboxPath(resolvedMailbox),
    resolved_outbox: resolveMemberOutboxPath(project.path, roster, handle),
    is_special_handle: entry.handle === HUMAN_HANDLE,
  };
}
