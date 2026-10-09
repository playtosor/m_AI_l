import { MessageNotFoundError } from "../domain/errors";
import { DeleteMessageResult } from "../domain/types";
import { removeMessageCore } from "./message-removal-core";

/**
 * Delete a single targeted message from a mailbox (admin only in v1).
 * The message is permanently removed without archiving.
 * Only works if the message is still in the active mailbox.
 */
export function deleteMessage(
  projectHandle: string,
  mailboxHandle: string,
  sender: string,
  timestamp: string,
  subject: string,
  // NOTE: optional-param order intentionally differs from cancelMail; frozen by Option B (public signatures preserved, 2026-08). Do not align.
  senderProjectHandle?: string,
  mailboxOverride?: string
): DeleteMessageResult {
  const removed = removeMessageCore({
    projectHandle,
    recipientHandle: mailboxHandle,
    sender,
    timestamp,
    subject,
    senderProjectHandle,
    mailboxOverride,
    opLabel: "delete_message",
  });
  if (!removed) {
    throw new MessageNotFoundError(
      `No active message found for sender=${sender}, timestamp=${timestamp}, subject=${subject}.`
    );
  }
  return {
    status: "deleted",
    deleted_message: removed,
  };
}
