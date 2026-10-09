import { resolveMemberPaths } from "./member-paths";
import { tryParseHeaderLine } from "../lib/message-format";
import { writeFileAtomic } from "../lib/fs-atomic";
import { MailboxNotFoundError } from "../domain/errors";
import { MailboxRef, Message } from "../domain/types";
import { SENTINEL } from "../domain/constants";
import fs from "fs";

export interface ListMessagesInput {
  mailbox: MailboxRef;
  source: "active" | "archive";
  offset: number;
  limit: number;
}

export interface ListMessagesResult {
  messages: Message[];
  total: number;
  hasMore: boolean;
}

/**
 * Paginates messages from a mailbox or archive without loading the whole
 * file into memory. Walks lines, counts headers, and only materializes
 * Message objects inside the requested window (plus one extra to compute
 * hasMore without a second pass).
 *
 * - source 'active' → member's mailbox file
 * - source 'archive' → member's archive file
 *
 * Resolves paths via the project's roster (mailboxOverride is not supported
 * here; callers needing override should pass a custom MailboxRef through a
 * higher-level helper).
 */
export function listMessages(input: ListMessagesInput): ListMessagesResult {
  const { mailbox, source, offset, limit } = input;

  if (offset < 0 || limit < 0) {
    throw new RangeError(`offset and limit must be non-negative (offset=${offset}, limit=${limit})`);
  }

  const paths = resolveMemberPaths(mailbox.project_handle, mailbox.handle);
  const targetPath = source === "archive" ? paths.archive_path : paths.mailbox_path;

  if (!fs.existsSync(targetPath)) {
    throw new MailboxNotFoundError(mailbox.handle);
  }

  // Self-heal the sentinel before reading so the split is reliable.
  ensureLocalSentinel(targetPath);

  const content = fs.readFileSync(targetPath, "utf-8");
  const messagesSection = content.split(SENTINEL)[0];
  const lines = messagesSection.split("\n");

  let headerIndex = 0;
  let current: { message: Message; bodyLines: string[] } | null = null;
  // Materialize up to limit + 1 so we can decide hasMore without re-parsing.
  const collected: Message[] = [];

  const flushCurrent = (): void => {
    if (!current) return;
    if (headerIndex - 1 >= offset && headerIndex - 1 < offset + limit + 1) {
      // V3.0 BAC 2A — E5: join body lines once at flush time instead of
      // concatenating via template literal on every body line (O(n^2)
      // per message in pathological long bodies).
      // The single-segment body parsed by `tryParseHeaderLine` is the seed;
      // append any multi-line bodyLines collected after the header.
      const seed = current.message.body;
      const extra = current.bodyLines.join("\n");
      current.message.body = extra.length === 0 ? seed : (seed.length === 0 ? extra : `${seed}\n${extra}`);
      collected.push(current.message);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") continue;

    const header = tryParseHeaderLine(line);
    if (header) {
      flushCurrent();
      current = { message: { ...header.message }, bodyLines: [] };
      headerIndex += 1;
      continue;
    }

    if (current) {
      // V3.0 BAC 2A — E5: buffer body lines, join once on flush.
      current.bodyLines.push(line);
    }
  }
  flushCurrent();

  const total = headerIndex;
  const messages = collected.slice(0, limit);
  const hasMore = offset + limit < total;

  return { messages, total, hasMore };
}

/**
 * Local equivalent of src/lib/sentinel.ts ensureSentinel that does not
 * touch the lock subsystem (listMessages is a read path and must not
 * acquire a write lock on the mailbox file).
 */
function ensureLocalSentinel(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  if (content.includes(SENTINEL)) return;
  const next = content.replace(/\s*$/, "") + `\n${SENTINEL}\n`;
  writeFileAtomic(filePath, next);
}
