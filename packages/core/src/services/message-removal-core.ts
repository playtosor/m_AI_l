import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { RosterEntryNotFoundError } from "../domain/errors";
import { MessageKey } from "../domain/types";
import { withFileLock } from "../lib/lock";
import { resolveEffectiveSender } from "../lib/sender-resolution";
import {
  assertRecipientIsDeliverable,
  findRosterEntry,
  resolveMemberMailboxPath,
  sanitizeMessageField,
} from "./mail-routing";
import { removeMessageFromPath } from "../repositories/mailbox-repo";

export interface RemoveMessageCoreParams {
  projectHandle: string;
  recipientHandle: string;
  sender: string;
  timestamp: string;
  subject: string;
  senderProjectHandle?: string;
  mailboxOverride?: string;
  opLabel: string;
}

/**
 * Shared delete/cancel sequence: resolve the recipient mailbox, build the
 * message key, and remove the matching message under a file lock.
 *
 * Returns the removed message, or `null` when no active message matches.
 * Does NOT throw `MessageNotFoundError` — each caller throws its own exact
 * error so the two public signatures keep distinct messages and return
 * envelopes.
 */
export function removeMessageCore(
  params: RemoveMessageCoreParams
): ReturnType<typeof removeMessageFromPath> {
  const {
    projectHandle,
    recipientHandle,
    sender,
    timestamp,
    subject,
    senderProjectHandle,
    mailboxOverride,
    opLabel,
  } = params;

  const project = getProject(projectHandle);
  const roster = getRoster(project.path, project.roster);

  const recipientEntry = findRosterEntry(roster, recipientHandle);
  if (!recipientEntry) {
    throw new RosterEntryNotFoundError(recipientHandle);
  }
  assertRecipientIsDeliverable(recipientEntry);

  const mailboxPath = resolveMemberMailboxPath(
    project.path,
    roster,
    recipientHandle,
    mailboxOverride
  );

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

  return withFileLock(mailboxPath, opLabel, () =>
    removeMessageFromPath(mailboxPath, key)
  );
}
