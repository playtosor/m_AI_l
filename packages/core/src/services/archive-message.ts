import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { MessageNotFoundError, RosterEntryNotFoundError } from "../domain/errors";
import { MessageKey, Message, ArchiveMessageResult } from "../domain/types";
import { withFileLock } from "../lib/lock";
import { resolveEffectiveSender } from "../lib/sender-resolution";
import { assertRecipientIsDeliverable, findRosterEntry, resolveMemberMailboxPath, resolveArchivePathFromMailboxPath, sanitizeMessageField } from "./mail-routing";
import { removeMessageFromPath, archiveMessagesAtPaths } from "../repositories/mailbox-repo";
import { formatMessage } from "../lib/message-format";
import fs from "fs";
import { insertBeforeSentinel, ensureSentinel } from "../lib/sentinel";
import { writeFileAtomic } from "../lib/fs-atomic";

/**
 * Archive a single targeted message from a mailbox.
 * The message is identified by sender, timestamp, and subject.
 * Only archives the message if it is still in the active mailbox.
 */
export function archiveMessage(
  projectHandle: string,
  mailboxHandle: string,
  sender: string,
  timestamp: string,
  subject: string,
  senderProjectHandle?: string,
  mailboxOverride?: string
): ArchiveMessageResult {
  const project = getProject(projectHandle);
  const roster = getRoster(project.path, project.roster);

  const recipientEntry = findRosterEntry(roster, mailboxHandle);
  if (!recipientEntry) {
    throw new RosterEntryNotFoundError(mailboxHandle);
  }
  assertRecipientIsDeliverable(recipientEntry);

  const mailboxPath = resolveMemberMailboxPath(
    project.path,
    roster,
    mailboxHandle,
    mailboxOverride
  );
  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);

  const effectiveSender = resolveEffectiveSender(
    sender,
    senderProjectHandle,
    projectHandle
  );

  const key: MessageKey = {
    sender: effectiveSender,
    timestamp,
    subject: sanitizeMessageField(subject),
  };

  const archivedMessage = withFileLock(mailboxPath, "archive_message", () => {
    // Remove message from mailbox
    const removed = removeMessageFromPath(mailboxPath, key);
    if (!removed) {
      throw new MessageNotFoundError(
        `No active message found for sender=${sender}, timestamp=${timestamp}, subject=${subject}.`
      );
    }

    // Append to archive
 if (!fs.existsSync(archivePath)) {
 writeFileAtomic(archivePath, "<!-- END -->\n");
 }
    ensureSentinel(archivePath);
    const formattedMessage = formatMessage(removed);
    insertBeforeSentinel(archivePath, formattedMessage);

    return removed;
  });

  return {
    status: "archived",
    archived_message: archivedMessage,
  };
}
