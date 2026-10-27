import { Message, Priority } from "../domain/types";

/**
 * Shared message format parsing and serialization.
 * Message format: `sender // timestamp // priority // subject // body`
 */

const TIMESTAMP_RE = /^\d{8}-\d{4}$/;
const CANONICAL_RE = /^(.+?) \/\/ (.+?) \/\/ (.+?) \/\/ (.+?) \/\/ ?(.*)$/;
const NO_PRIORITY_RE = /^(.+?) \/\/ (.+?) \/\/ (.+?) \/\/ ?(.*)$/;

/**
 * Field delimiter and its escape character.
 *
 * The on-disk format is a bare ` // `-delimited header line followed by
 * unprefixed, free-text body lines, with NO message terminator. The reader
 * (`parseMailboxStateFromPath`, `listMessages`) is line-oriented: ANY line that
 * matches the header shape starts a new message. A ` // ` sequence inside a
 * field — most importantly inside a line of a multi-line body — is therefore
 * re-interpreted as a field separator / new message, producing permuted
 * "phantom" messages (adjudication D3).
 *
 * To keep the on-disk format unambiguous, every field is serialized with ` // `
 * escaped to `‖` (U+2016 DOUBLE VERTICAL LINE), and the escape is restored to
 * ` // ` on read. `‖` is a single character that does not occur in normal
 * message text. This applies to newly written content only; existing on-disk
 * messages are never migrated (adjudication D2).
 */
const DELIMITER = " // ";
const ESCAPE = "\u2016"; // ‖ U+2016 DOUBLE VERTICAL LINE

/**
 * Replace every field delimiter ` // ` with the escape character. Applied to
 * each field before serialization so a field value can never inject a
 * delimiter (nor a header-looking body line).
 */
export function escapeDelimiters(text: string): string {
  return text.split(DELIMITER).join(ESCAPE);
}

/**
 * Reverse of `escapeDelimiters`: restore `‖` back to ` // `. Applied to every
 * field after parsing so callers see the original text.
 */
export function restoreDelimiters(text: string): string {
  return text.split(ESCAPE).join(DELIMITER);
}

/**
 * Normalize a priority value to H/M/L. Defaults to "M" for unknown values.
 */
export function normalizePriority(value: string): Priority {
  if (value === "H" || value === "M" || value === "L") {
    return value;
  }
  return "M";
}

/**
 * Try to parse a message header line.
 * Returns the parsed message and warning count, or null if the line doesn't match.
 */
export function tryParseHeaderLine(line: string): { message: Message; warning_count: number } | null {
  const canonicalMatch = line.match(CANONICAL_RE);
  if (canonicalMatch) {
    const [, sender, timestamp, priorityCandidate, subject, body] = canonicalMatch;
    let warning_count = 0;
    const priority = normalizePriority(priorityCandidate.trim());
    if (priorityCandidate.trim() !== priority) {
      warning_count += 1;
    }
    if (!TIMESTAMP_RE.test(timestamp.trim())) {
      warning_count += 1;
    }
    return {
      message: {
        sender: restoreDelimiters(sender.trim()),
        timestamp: restoreDelimiters(timestamp.trim()),
        priority,
        subject: restoreDelimiters(subject.trim()),
        body: restoreDelimiters(body),
      },
      warning_count,
    };
  }
  const noPriorityMatch = line.match(NO_PRIORITY_RE);
  if (!noPriorityMatch) {
    return null;
  }
  const [, sender, timestamp, subject, body] = noPriorityMatch;
  if (!sender.trim() || !timestamp.trim() || !subject.trim()) {
    return null;
  }
  let warning_count = 1;
  if (!TIMESTAMP_RE.test(timestamp.trim())) {
    warning_count += 1;
  }
  return {
    message: {
      sender: restoreDelimiters(sender.trim()),
      timestamp: restoreDelimiters(timestamp.trim()),
      priority: "M",
      subject: restoreDelimiters(subject.trim()),
      body: restoreDelimiters(body),
    },
    warning_count,
  };
}

/**
 * Parse a message header line, throwing on invalid format.
 */
export function parseMessage(line: string): Message {
  const header = tryParseHeaderLine(line);
  if (!header) {
    throw new Error(`Invalid message format: ${line}`);
  }
  return header.message;
}

/**
 * Format a message into the canonical ` // `-separated line. Every field is
 * escaped (see `escapeDelimiters`) so the serialized line stays unambiguous
 * even when a field contains ` // `.
 */
export function formatMessage(message: Message): string {
  return [
    escapeDelimiters(message.sender),
    escapeDelimiters(message.timestamp),
    escapeDelimiters(message.priority),
    escapeDelimiters(message.subject),
    escapeDelimiters(message.body),
  ].join(DELIMITER);
}

/**
 * OUTBOX write guard. The outbox format is `timestamp // recipient // subject`,
 * parsed by splitting on ` // ` and requiring three parts. A ` // ` inside the
 * subject would break that split, so it is normalized to ` ∕∕ ` (U+2215 division
 * slash) on WRITE ONLY. Existing on-disk entries are NEVER migrated, re-parsed,
 * or rewritten — this only affects newly written content (SIMPLIFY #9 /
 * adjudication D2).
 *
 * The mailbox path no longer uses this: it relies on `formatMessage` /
 * `escapeDelimiters` (the `‖` escape) for every field, subject included.
 *
 * Not re-exported from the `src/index.ts` barrel: it is an internal write
 * guard, not part of the public service surface.
 */
const SUBJECT_DELIMITER = " // ";
export function sanitizeSubjectDelimiter(subject: string): string {
  return subject.split(SUBJECT_DELIMITER).join(" ∕∕ "); // U+2215 division slash
}
