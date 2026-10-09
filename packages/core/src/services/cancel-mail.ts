import { MessageNotFoundError } from "../domain/errors";
import { removeMessageCore } from "./message-removal-core";

export function cancelMail(
  projectHandle: string,
  sender: string,
  recipient: string,
  timestamp: string,
  subject: string,
  // NOTE: optional-param order intentionally differs from deleteMessage; frozen by Option B (public signatures preserved, 2026-08). Do not align.
  mailboxOverride?: string,
  senderProjectHandle?: string
) {
  const removed = removeMessageCore({
    projectHandle,
    recipientHandle: recipient,
    sender,
    timestamp,
    subject,
    senderProjectHandle,
    mailboxOverride,
    opLabel: "cancel_mail",
  });
  if (!removed) {
    throw new MessageNotFoundError(
      `No active message found for sender=${sender}, recipient=${recipient}, timestamp=${timestamp}, subject=${subject}.`
    );
  }
  return removed;
}
