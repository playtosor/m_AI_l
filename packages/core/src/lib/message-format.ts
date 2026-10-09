import { Message, Priority } from "../domain/types";

/**
 * Shared message format parsing and serialization.
 * Message format: `sender // timestamp // priority // subject // body`
 */

const TIMESTAMP_RE = /^\d{8}-\d{4}$/;
const CANONICAL_RE = /^(.+?) \/\/ (.+?) \/\/ (.+?) \/\/ (.+?) \/\/ ?(.*)$/;
const NO_PRIORITY_RE = /^(.+?) \/\/ (.+?) \/\/ (.+?) \/\/ ?(.*)$/;

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
        sender: sender.trim(),
        timestamp: timestamp.trim(),
        priority,
        subject: subject.trim(),
        body,
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
      sender: sender.trim(),
      timestamp: timestamp.trim(),
      priority: "M",
      subject: subject.trim(),
      body,
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
 * Format a message into the canonical ` // `-separated line.
 */
export function formatMessage(message: Message): string {
  return `${message.sender} // ${message.timestamp} // ${message.priority} // ${message.subject} // ${message.body}`;
}

/**
 * The canonical message format splits a header line on ` // `:
 * `sender // timestamp // priority // subject // body`. A ` // ` sequence
 * inside the subject would be re-split at read time (cancel/edit then fail
 * to match the MessageKey, get_outbox throws). To keep the on-disk format
 * unambiguous, normalize ` // ` in subjects to ` ∕∕ ` (U+2215 division
 * slash) on WRITE ONLY. Existing on-disk messages are NEVER migrated,
 * re-parsed, or rewritten — this only affects newly written content
 * (SIMPLIFY #9 / adjudication D2).
 *
 * Not re-exported from the `src/index.ts` barrel: it is an internal write
 * guard, not part of the public service surface.
 */
const SUBJECT_DELIMITER = " // ";
export function sanitizeSubjectDelimiter(subject: string): string {
  return subject.split(SUBJECT_DELIMITER).join(" ∕∕ "); // U+2215 division slash
}
