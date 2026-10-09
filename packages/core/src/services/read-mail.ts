import {
  archiveMailboxSnapshotAtPaths,
  archiveNMessagesAtPaths,
  readMailboxSnapshotFromPath,
} from "../repositories/mailbox-repo";
import { getProject } from "../repositories/projects-repo";
import { MailboxSnapshot, RosterEntry } from "../domain/types";
import { getRoster } from "../repositories/roster-repo";
import { resolveArchivePathFromMailboxPath, resolveMemberMailboxPath } from "./mail-routing";
import { withFileLock } from "../lib/lock";

export interface ReadMailOptions {
  limit?: number;
  noArchive?: boolean;
  mailboxOverride?: string;
  roster?: RosterEntry[];
}

export function readMail(
  projectHandle: string,
  handle: string,
  options: ReadMailOptions = {}
): MailboxSnapshot {
  const { limit, noArchive = false, mailboxOverride, roster: rosterOverride } = options;
  const project = getProject(projectHandle);
  const roster = rosterOverride || getRoster(project.path, project.roster);
  const mailboxPath = resolveMemberMailboxPath(project.path, roster, handle, mailboxOverride);

  if (noArchive) {
    const snapshot = readMailboxSnapshotFromPath(mailboxPath);
    if (limit !== undefined) {
      return {
        ...snapshot,
        messages: snapshot.messages.slice(0, limit),
      };
    }
    return snapshot;
  }

  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
  return withFileLock(mailboxPath, "read_mail", () => {
    if (limit !== undefined) {
      return archiveNMessagesAtPaths(mailboxPath, archivePath, limit);
    }
    return archiveMailboxSnapshotAtPaths(mailboxPath, archivePath);
  });
}
