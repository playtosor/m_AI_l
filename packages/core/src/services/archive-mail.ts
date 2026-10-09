import { archiveMessagesAtPaths } from "../repositories/mailbox-repo";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { resolveArchivePathFromMailboxPath, resolveMemberMailboxPath } from "./mail-routing";

export function archiveMail(projectHandle: string, handle: string, mailboxOverride?: string): void {
  const project = getProject(projectHandle);
  const roster = getRoster(project.path, project.roster);
  const mailboxPath = resolveMemberMailboxPath(project.path, roster, handle, mailboxOverride);
  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
  archiveMessagesAtPaths(mailboxPath, archivePath);
}
