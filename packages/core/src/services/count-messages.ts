import { resolveMemberPaths } from "./member-paths";
import { MailboxRef } from "../domain/types";
import fs from "fs";

export interface CountMessagesInput {
  mailbox: MailboxRef;
  source: "active" | "archive";
}

export interface CountMessagesResult {
  count: number;
}

// Tolerates both canonical (5 segments) and legacy (4 segments) header
// formats — see src/lib/message-format.ts.
const CANONICAL_HEADER_RE = /^(.+?) \/\/ (.+?) \/\/ (.+?) \/\/ (.+?) \/\/ ?(.*)$/;
const NO_PRIORITY_HEADER_RE = /^(.+?) \/\/ (.+?) \/\/ (.+?) \/\/ ?(.*)$/;

/**
 * Counts messages in a mailbox or archive by scanning lines for header
 * patterns. Does not parse message bodies, so it stays cheap on large
 * archives.
 *
 * Returns { count: 0 } for missing files (used for UI badge counts where
 * a missing mailbox means "empty / not initialized", not an error).
 */
export function countMessages(input: CountMessagesInput): CountMessagesResult {
  const { mailbox, source } = input;

  const paths = resolveMemberPaths(mailbox.project_handle, mailbox.handle);
  const targetPath = source === "archive" ? paths.archive_path : paths.mailbox_path;

  if (!fs.existsSync(targetPath)) {
    return { count: 0 };
  }

  let count = 0;
  const stream = fs.readFileSync(targetPath, "utf-8");
  for (const rawLine of stream.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (line === "" || line === "<!-- END -->") continue;
    if (CANONICAL_HEADER_RE.test(line) || NO_PRIORITY_HEADER_RE.test(line)) {
      count += 1;
    }
  }
  return { count };
}
