import { initMailboxAtPaths } from "../repositories/mailbox-repo";
import { addRosterEntry, getRoster } from "../repositories/roster-repo";
import { getProject } from "../repositories/projects-repo";
import { RosterEntryExistsError } from "../domain/errors";
import { RosterEntry } from "../domain/types";
import { getRosterPath } from "../lib/paths";
import { withFileLock } from "../lib/lock";
import { resolveArchivePathFromMailboxPath, resolveMailboxPathFromValue, resolveOutboxPathFromMailboxPath } from "./mail-routing";
import { handlesEqual, normalizeHandle } from "../lib/handles";

export function initMail(
  projectHandle: string,
  handle: string,
  role: string,
  mailbox?: string,
  status: string = "active"
): void {
  const normalizedStatus: "active" | "inactive" =
    status === "inactive" ? "inactive" : "active";
  const normalizedHandle = normalizeHandle(handle);
  const project = getProject(projectHandle);
  const mailboxValue = mailbox ?? `mailbox_${normalizedHandle}.md`;
  const mailboxPath = resolveMailboxPathFromValue(project.path, normalizedHandle, mailboxValue);
  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
  const outboxPath = resolveOutboxPathFromMailboxPath(mailboxPath, normalizedHandle);
  const rosterEntry: RosterEntry = {
    handle: normalizedHandle,
    role,
    mailbox: mailboxValue,
    status: normalizedStatus,
  };

  const rosterPath = getRosterPath(project.path, project.roster);
  withFileLock(rosterPath, "init_mail", () => {
    const existingEntries = getRoster(project.path, project.roster);
    if (existingEntries.some(entry => handlesEqual(entry.handle, normalizedHandle))) {
      throw new RosterEntryExistsError(normalizedHandle);
    }

    initMailboxAtPaths(mailboxPath, archivePath, outboxPath);
    addRosterEntry(project.path, rosterEntry, project.roster);
  });
}
