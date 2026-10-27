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
import { appendActivityLog } from "../lib/activity-log";

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
    // The mailbox format escapes ` // ` in every field at serialization time
    // (formatMessage / escapeDelimiters), so the subject needs no pre-sanitize
    // here. The outbox below keeps its own ` ∕∕ ` guard (its format is not
    // escaped).
    subject: sanitizeMessageField(subject),
    body: sanitizeMessageField(body),
  };

  const mailboxPath = resolveMemberMailboxPath(project.path, roster, recipient, mailboxOverride);
  withFileLock(mailboxPath, "write_mail", () => {
    writeMessageToPath(mailboxPath, message);
  });

  const outboxEntry: OutboxEntry = {
    timestamp,
    recipient: sanitizeMessageField(recipient),
    // The outbox format (`timestamp // recipient // subject`) is not escaped,
    // so guard its subject against ` // ` with the dedicated sanitizer.
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

  // D1/D6: best-effort cross-project activity log, after the message is
  // durably written. appendActivityLog never throws — a log failure must not
  // affect the send.
  appendActivityLog({
    timestamp: new Date().toISOString(),
    project: projectHandle,
    sender: message.sender,
    recipient,
    subject: message.subject,
    // The log's `project` is the recipient's project (mailbox host); the
    // sender's origin project is recorded explicitly so cross-project sends
    // are distinguishable. Intra-project sends repeat the same value. When no
    // explicit sender project is given but the sender is qualified
    // ("PROJECT/HANDLE" — e.g. the handover path), derive the prefix, mirroring
    // the reader's legacy derivation.
    sender_project:
      senderProjectHandle || (sender.includes("/") ? sender.split("/")[0] : projectHandle),
  });

  return { effectiveSender, timestamp, outboxWriteFailed };
}
