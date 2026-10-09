import { handlesEqual, parseQualifiedHandle } from "./handles";

export function resolveEffectiveSender(
  sender: string,
  senderProjectHandle: string | undefined,
  targetProjectHandle: string
): string {
  if (!senderProjectHandle || senderProjectHandle === '') {
    return sender;
  }
  if (handlesEqual(senderProjectHandle, targetProjectHandle)) {
    // Same-project sender: normalize to the bare handle so write-time and
    // read-time (archive/edit/cancel/delete) resolution agree. The sender
    // may already be qualified as "PROJECT/HANDLE" — strip the prefix.
    const idx = sender.indexOf("/");
    if (idx > 0) {
      return sender.substring(idx + 1);
    }
    return sender;
  }
  // Cross-project sender: qualify with the origin project, but avoid double
  // qualification when the sender already carries the prefix. The prefix
  // comparison is case-insensitive (handles are uppercase end-to-end, but
  // callers may pass mixed-case input).
  const parsed = parseQualifiedHandle(sender);
  if (parsed.project && handlesEqual(parsed.project, senderProjectHandle)) {
    return `${parsed.project}/${parsed.handle}`;
  }
  return `${senderProjectHandle}/${sender}`;
}