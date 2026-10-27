import { replaceMessageInPath } from "../repositories/mailbox-repo";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { Message, MessageKey, Priority } from "../domain/types";
import { RosterEntryNotFoundError } from "../domain/errors";
import { withFileLock } from "../lib/lock";
import { resolveEffectiveSender } from "../lib/sender-resolution";
import { assertRecipientIsDeliverable, findRosterEntry, resolveMemberMailboxPath, sanitizeMessageField } from "./mail-routing";
import { writeMail } from "./write-mail";

export function editMail(
  projectHandle: string,
  sender: string,
  recipient: string,
  timestamp: string,
  subject: string,
  updates: {
    priority?: Priority;
    subject?: string;
    body?: string;
  },
  mailboxOverride?: string,
  senderProjectHandle?: string
) {
  const project = getProject(projectHandle);
  const roster = getRoster(project.path, project.roster);

  const recipientEntry = findRosterEntry(roster, recipient);
  if (!recipientEntry) {
    throw new RosterEntryNotFoundError(recipient);
  }
  assertRecipientIsDeliverable(recipientEntry);

  const mailboxPath = resolveMemberMailboxPath(project.path, roster, recipient, mailboxOverride);

  const effectiveSender = resolveEffectiveSender(sender, senderProjectHandle, projectHandle);

  const key: MessageKey = {
    sender: effectiveSender,
    timestamp,
    subject: sanitizeMessageField(subject),
  };

  let updatedMessage: Message | null = null;

  const previous = withFileLock(mailboxPath, "edit_mail", () => replaceMessageInPath(mailboxPath, key, current => {
    updatedMessage = {
      sender: current.sender,
      timestamp: current.timestamp,
      priority: updates.priority ?? current.priority,
      // formatMessage escapes ` // ` in every field on serialization.
      subject: sanitizeMessageField(updates.subject ?? current.subject),
      body: sanitizeMessageField(updates.body ?? current.body),
    };
    return updatedMessage;
  }));

  if (previous && updatedMessage) {
    return {
      mode: "edited_in_place" as const,
      previous,
      message: updatedMessage,
    };
  }

  const correctionSubject = sanitizeMessageField(`CORRECTION: ${updates.subject ?? subject}`);
  const correctionBody = buildCorrectionBody(timestamp, subject, updates.subject, updates.body);
  const correctionPriority = updates.priority ?? "M";

  const correctionResult = writeMail(projectHandle, sender, recipient, correctionPriority, correctionSubject, correctionBody, mailboxOverride, senderProjectHandle);

  return {
    mode: "correction_sent" as const,
    previous: null,
    message: {
      sender: effectiveSender,
      timestamp: correctionResult.timestamp,
      priority: correctionPriority,
      subject: correctionSubject,
      body: correctionBody,
    },
  };
}

function buildCorrectionBody(originalTimestamp: string, originalSubject: string, nextSubject?: string, nextBody?: string): string {
  const segments = [
    `Correction for message ${originalTimestamp}.`,
    `Original subject: ${sanitizeMessageField(originalSubject)}`,
  ];
  if (nextSubject) {
    segments.push(`Updated subject: ${sanitizeMessageField(nextSubject)}`);
  }
  if (nextBody) {
    segments.push(`Updated body: ${sanitizeMessageField(nextBody)}`);
  } else {
    segments.push("Updated body: no replacement body provided.");
  }
  return segments.join(" ");
}
