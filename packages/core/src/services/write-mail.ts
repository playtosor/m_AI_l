import { writeMessageToPath } from "../repositories/mailbox-repo";
import { writeOutboxEntryToPath } from "../repositories/outbox-repo";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { RosterEntryNotFoundError } from "../domain/errors";
import { Message, OutboxEntry, RosterEntry, WriteMailResult } from "../domain/types";
import { withFileLock } from "../lib/lock";
import { getCurrentTimestamp } from "../lib/time";
import {
  assertRecipientIsDeliverable,
  findRosterEntry,
  resolveMemberOutboxPath,
  resolveMemberMailboxPath,
  sanitizeMessageField,
} from "./mail-routing";
import { sanitizeSubjectDelimiter } from "../lib/message-format";
import { resolveEffectiveSender } from "../lib/sender-resolution";

export function writeMail(
  projectHandle: string,
  sender: string,
  recipient: string,
  priority: "H" | "M" | "L",
  subject: string,
  body: string,
  mailboxOverride?: string,
  senderProjectHandle?: string,
  rosterOverride?: RosterEntry[]
): WriteMailResult {
  const project = getProject(projectHandle);
  const roster = rosterOverride || getRoster(project.path, project.roster);

  const recipientEntry = findRosterEntry(roster, recipient);
  if (!recipientEntry) {
    throw new RosterEntryNotFoundError(recipient);
  }
  assertRecipientIsDeliverable(recipientEntry);

  const timestamp = getCurrentTimestamp();
  const effectiveSender = resolveEffectiveSender(sender, senderProjectHandle, projectHandle);

  const message: Message = {
    // S9: sanitize sender and timestamp too — the canonical message format
    // splits on ` // `, so a malicious sender containing `<!-- END -->` or
    // a timestamp payload injecting another ` // body // ...` segment
    // could escape the message envelope during round-trip parsing.
    sender: sanitizeMessageField(effectiveSender),
    timestamp: sanitizeMessageField(timestamp),
    priority,
    // D2/#9: normalize ` // ` in the subject so it is not re-split at read.
    subject: sanitizeMessageField(sanitizeSubjectDelimiter(subject)),
    body: sanitizeMessageField(body),
  };

  const mailboxPath = resolveMemberMailboxPath(project.path, roster, recipient, mailboxOverride);
  withFileLock(mailboxPath, "write_mail", () => {
    writeMessageToPath(mailboxPath, message);
  });

  const outboxEntry: OutboxEntry = {
    timestamp,
    recipient: sanitizeMessageField(recipient),
    // Keep the outbox subject consistent with the stored message subject.
    subject: sanitizeMessageField(sanitizeSubjectDelimiter(subject)),
  };

  let outboxWriteFailed = false;
  try {
    const senderOutboxPath = resolveMemberOutboxPath(project.path, roster, sender);
    writeOutboxEntryToPath(senderOutboxPath, outboxEntry);
  } catch (error) {
    outboxWriteFailed = true;
    console.warn(`[m_AI_l] Failed to write outbox entry for sender=${sender}:`, error);
  }

  return { effectiveSender, timestamp, outboxWriteFailed };
}
