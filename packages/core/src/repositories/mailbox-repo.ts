import { MailboxSnapshot, Message, MessageKey } from "../domain/types";
import { getMailboxPath, getArchivePath, getOutboxPath } from "../lib/paths";
import { ensureSentinel, insertBeforeSentinel, resetFileWithSentinel } from "../lib/sentinel";
import { writeFileAtomic } from "../lib/fs-atomic";
import { FileOperationError, MessageConflictError } from "../domain/errors";
import { tryParseHeaderLine, formatMessage } from "../lib/message-format";
import { SENTINEL } from "../domain/constants";
import fs from "fs";

type ParsedMailboxItem =
  | { type: "entry"; message: Message; raw_lines: string[]; warning_count: number }
  | { type: "invalid"; raw_line: string };

export type ParsedMailboxState = {
  items: ParsedMailboxItem[];
  snapshot: MailboxSnapshot;
};

export function readMessages(projectPath: string, handle: string): Message[] {
  const mailboxPath = getMailboxPath(projectPath, handle);
  return readMessagesFromPath(mailboxPath);
}

export function readMessagesFromPath(mailboxPath: string): Message[] {
  return readMailboxSnapshotFromPath(mailboxPath).messages;
}

export function readMailboxSnapshotFromPath(mailboxPath: string): MailboxSnapshot {
  return parseMailboxStateFromPath(mailboxPath).snapshot;
}



export function writeMessage(projectPath: string, handle: string, message: Message): void {
  const mailboxPath = getMailboxPath(projectPath, handle);
  writeMessageToPath(mailboxPath, message);
}

export function writeMessageToPath(mailboxPath: string, message: Message): void {
  if (!fs.existsSync(mailboxPath)) {
    throw new FileOperationError(`Mailbox not found: ${mailboxPath}`);
  }
  const content = ensureSentinel(mailboxPath);
  const formattedMessage = formatMessage(message);
  insertBeforeSentinel(mailboxPath, formattedMessage, content);
}

export function removeMessageFromPath(mailboxPath: string, key: MessageKey): Message | null {
  const result = updateMessageInPath(mailboxPath, key, () => null);
  return result.previous;
}

export function replaceMessageInPath(
  mailboxPath: string,
  key: MessageKey,
  nextMessage: Message | ((message: Message) => Message)
): Message | null {
  const result = updateMessageInPath(mailboxPath, key, message =>
    typeof nextMessage === "function" ? nextMessage(message) : nextMessage
  );
  return result.previous;
}

export function archiveMessagesAtPaths(mailboxPath: string, archivePath: string): void {
  archiveMailboxSnapshotAtPaths(mailboxPath, archivePath);
}

export function archiveMailboxSnapshotAtPaths(mailboxPath: string, archivePath: string): MailboxSnapshot {
  if (!fs.existsSync(mailboxPath)) {
    throw new FileOperationError(`Mailbox not found: ${mailboxPath}`);
  }
  const state = parseMailboxStateFromPath(mailboxPath);
  const entries = state.items.filter(
    (item): item is Extract<ParsedMailboxItem, { type: "entry" }> => item.type === "entry"
  );
  if (entries.length > 0) {
    if (!fs.existsSync(archivePath)) {
      resetFileWithSentinel(archivePath);
    }
    const archiveContent = ensureSentinel(archivePath);
    insertBeforeSentinel(
      archivePath,
      entries.map(entry => entry.raw_lines.join("\n")).join("\n"),
      archiveContent
    );
  }
  const remainingLines = state.items
    .filter(item => item.type === "invalid")
    .map(item => item.raw_line);
  rewriteMailboxWithLines(mailboxPath, remainingLines);
  return state.snapshot;
}

export function archiveOldestMessageAtPaths(mailboxPath: string, archivePath: string): Message | null {
  if (!fs.existsSync(mailboxPath)) {
    throw new FileOperationError(`Mailbox not found: ${mailboxPath}`);
  }
  const state = parseMailboxStateFromPath(mailboxPath);
  const firstEntryIndex = state.items.findIndex(item => item.type === "entry");
  if (firstEntryIndex < 0) {
    return null;
  }
  const firstEntry = state.items[firstEntryIndex] as Extract<ParsedMailboxItem, { type: "entry" }>;
  if (!fs.existsSync(archivePath)) {
    resetFileWithSentinel(archivePath);
  }
  const archiveContent = ensureSentinel(archivePath);
  insertBeforeSentinel(archivePath, firstEntry.raw_lines.join("\n"), archiveContent);
  const remainingLines = state.items
    .filter((_, index) => index !== firstEntryIndex)
    .flatMap(item => (item.type === "entry" ? item.raw_lines : [item.raw_line]));
  rewriteMailboxWithLines(mailboxPath, remainingLines);
  return firstEntry.message;
}

export function archiveNMessagesAtPaths(
  mailboxPath: string,
  archivePath: string,
  limit: number
): MailboxSnapshot {
  if (!fs.existsSync(mailboxPath)) {
    throw new FileOperationError(`Mailbox not found: ${mailboxPath}`);
  }
  return archiveNMessagesFromParsedState(
    mailboxPath,
    archivePath,
    parseMailboxStateFromPath(mailboxPath),
    limit
  );
}

/**
 * Like archiveNMessagesAtPaths but accepts an already-parsed mailbox state,
 * so the caller can avoid a second readFileSync when the state is already
 * in hand (e.g. a read+archive flow that needs to read and archive atomically).
 */
export function archiveNMessagesFromParsedState(
  mailboxPath: string,
  archivePath: string,
  state: ParsedMailboxState,
  limit: number
): MailboxSnapshot {
  const entries = state.items.filter(
    (item): item is Extract<ParsedMailboxItem, { type: "entry" }> => item.type === "entry"
  );
  const toArchive = entries.slice(0, limit);
  if (toArchive.length > 0) {
    if (!fs.existsSync(archivePath)) {
      resetFileWithSentinel(archivePath);
    }
    const archiveContent = ensureSentinel(archivePath);
    insertBeforeSentinel(
      archivePath,
      toArchive.map(e => e.raw_lines.join("\n")).join("\n"),
      archiveContent
    );
  }
  const remainingLines = state.items
    .filter(item => {
      if (item.type === "invalid") return true;
      if (item.type === "entry") return !toArchive.includes(item);
      return true;
    })
    .flatMap(item => (item.type === "entry" ? item.raw_lines : [item.raw_line]));
  rewriteMailboxWithLines(mailboxPath, remainingLines);
  return {
    messages: toArchive.map(e => e.message),
    invalid_lines: state.snapshot.invalid_lines,
    warning_count: state.snapshot.warning_count,
  };
}

export function initMailbox(projectPath: string, handle: string): void {
  const mailboxPath = getMailboxPath(projectPath, handle);
  const archivePath = getArchivePath(projectPath, handle);
  const outboxPath = getOutboxPath(projectPath, handle);
  initMailboxAtPaths(mailboxPath, archivePath, outboxPath);
}

export function initMailboxAtPaths(mailboxPath: string, archivePath: string, outboxPath: string): void {
  for (const path of [mailboxPath, archivePath, outboxPath]) {
    if (!fs.existsSync(path)) {
      // V2.5 SIMPLIFY WS4 — HIGH #3 swap string literal `<!-- END -->` for
      // the imported SENTINEL constant. resetFileWithSentinel already does
      // `${SENTINEL}\n` plus dirname mkdir, so reuse it.
      resetFileWithSentinel(path);
    }
  }
}

/**
 * Locates the single message in `mailboxPath` matching `key` and applies
 * `updater` to it. The updater returns either a replacement `Message`
 * (in-place edit) or `null` (drop the entry — used by archive flows).
 *
 * - Throws `FileOperationError` if the mailbox file is missing.
 * - Throws `MessageConflictError` if more than one entry matches `key`
 *   (ambiguous edit — caller must narrow the key).
 * - Returns `{ previous: null }` when no entry matches (no write occurs).
 * - On a successful match, the mailbox file is rewritten atomically with
 *   the updated content; multi-line bodies round-trip via the original
 *   raw lines preserved in the parsed state.
 */
function updateMessageInPath(
  mailboxPath: string,
  key: MessageKey,
  updater: (message: Message) => Message | null
): { previous: Message | null } {
  if (!fs.existsSync(mailboxPath)) {
    throw new FileOperationError(`Mailbox not found: ${mailboxPath}`);
  }
  // Reuse the same multiline-aware parser as the read path so we don't
  // re-throw on body lines the way parseMessage() does.
  const state = parseMailboxStateFromPath(mailboxPath);
  let matchCount = 0;
  let previous: Message | null = null;
  const updatedLines: string[] = [];

  for (const item of state.items) {
    if (item.type === "invalid") {
      updatedLines.push(item.raw_line);
      continue;
    }
    if (matchesMessageKey(item.message, key)) {
      matchCount += 1;
      previous = item.message;
      const replacement = updater(item.message);
      if (replacement) {
        updatedLines.push(formatMessage(replacement));
      }
      // If no replacement (archive), the entry is dropped — its raw_lines
      // (header + body lines) are simply not pushed.
    } else {
      // Preserve the original raw_lines so multi-line body structure
      // round-trips intact.
      for (const line of item.raw_lines) {
        updatedLines.push(line);
      }
    }
  }

  if (matchCount > 1) {
    throw new MessageConflictError(
      `Multiple active messages match sender=${key.sender}, timestamp=${key.timestamp}, subject=${key.subject}.`
    );
  }
  if (matchCount === 0) {
    return { previous: null };
  }
  rewriteMailboxWithLines(mailboxPath, updatedLines);
  return { previous };
}

/**
 * Parses a mailbox file into structured items (entries + invalid lines) and
 * a snapshot suitable for read APIs.
 *
 * - If `rawContent` is omitted, the file at `mailboxPath` is read (and its
 *   sentinel is ensured first via `ensureSentinel`).
 * - The returned `items` preserve the original raw lines so callers can
 *   round-trip multi-line bodies without losing structure.
 * - The returned `snapshot.messages` is the flat list of parsed messages
 *   (with bodies joined), `invalid_lines` are non-header lines that could
 *   not be associated with any entry, and `warning_count` aggregates the
 *   per-entry warnings emitted by the header parser.
 *
 * Throws `FileOperationError` if the file is missing and no `rawContent`
 * was supplied.
 */
export function parseMailboxStateFromPath(
  mailboxPath: string,
  rawContent?: string
): ParsedMailboxState {
  if (rawContent === undefined) {
    if (!fs.existsSync(mailboxPath)) {
      throw new FileOperationError(`Mailbox not found: ${mailboxPath}`);
    }
    // V2.5 SIMPLIFY WS4 — Finding #4: chain the content returned by
    // ensureSentinel instead of triggering a second fs.readFileSync.
    rawContent = ensureSentinel(mailboxPath);
  }
  const content = rawContent;
  const messagesSection = content.split(SENTINEL)[0].trim();
  if (!messagesSection) {
    return {
      items: [],
      snapshot: {
        messages: [],
        invalid_lines: [],
        warning_count: 0,
      },
    };
  }
  const lines = messagesSection.split("\n").filter(line => line.trim() !== "");
  const items: ParsedMailboxItem[] = [];
  let currentEntry: Extract<ParsedMailboxItem, { type: "entry" }> | null = null;
  for (const line of lines) {
    const header = tryParseHeaderLine(line);
    if (header) {
      if (currentEntry) {
        items.push(currentEntry);
      }
      currentEntry = {
        type: "entry",
        message: header.message,
        raw_lines: [line],
        warning_count: header.warning_count,
      };
      continue;
    }
    if (currentEntry) {
      currentEntry.raw_lines.push(line);
      // V3.0 BAC 2A — E5: buffer body lines, join once when the entry closes.
      // (Previously re-built the string on every body line; O(n^2) on long
      // bodies, hit hot path on every mailbox read.)
    } else {
      items.push({ type: "invalid", raw_line: line });
    }
  }
  if (currentEntry) {
    items.push(currentEntry);
  }
  // V3.0 BAC 2A — E5: single .join() per message → body string,
  // preserving any single-segment body the header regex already captured.
  for (const item of items) {
    if (item.type === "entry") {
      // First raw_line is the header (parsing it set item.message.body to
      // whatever the 5th regex group captured); subsequent lines are the
      // multi-line body extension.
      const extraBodyLines = item.raw_lines.slice(1);
      const seed = item.message.body;
      const extra = extraBodyLines.join("\n");
      item.message.body =
        extra.length === 0
          ? seed
          : seed.length === 0
            ? extra
            : `${seed}\n${extra}`;
    }
  }
  const messages = items
    .filter((item): item is Extract<ParsedMailboxItem, { type: "entry" }> => item.type === "entry")
    .map(item => item.message);
  const invalid_lines = items
    .filter((item): item is Extract<ParsedMailboxItem, { type: "invalid" }> => item.type === "invalid")
    .map(item => item.raw_line);
  const warning_count = items
    .filter((item): item is Extract<ParsedMailboxItem, { type: "entry" }> => item.type === "entry")
    .reduce((total, item) => total + item.warning_count, 0);
  return {
    items,
    snapshot: {
      messages,
      invalid_lines,
      warning_count,
    },
  };
}

function matchesMessageKey(message: Message, key: MessageKey): boolean {
  return (
    message.sender === key.sender &&
    message.timestamp === key.timestamp &&
    message.subject === key.subject
  );
}

function rewriteMailboxWithLines(mailboxPath: string, lines: string[]): void {
  const nextContent =
    lines.length > 0 ? `${lines.join("\n")}\n${SENTINEL}\n` : `${SENTINEL}\n`;
  writeFileAtomic(mailboxPath, nextContent);
}
