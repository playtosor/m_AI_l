import { resolveMemberPaths } from "./member-paths";
import { writeFileAtomic } from "../lib/fs-atomic";
import fs from "fs";

// Empty mailbox content: sentinel-only file. Mirrors initMailboxAtPaths in
// src/repositories/mailbox-repo.ts so repair leaves the file in the same
// state as fresh initialization.
const EMPTY_MAILBOX_CONTENT = "<!-- END -->\n";

export interface EnsureMailboxFilesInput {
  project_handle: string;
  handle: string;
}

export interface EnsureMailboxFilesResult {
  created: string[];
}

/**
 * Repairs a member's mailbox triple (mailbox / archive / outbox).
 * For each file, creates it with `<!-- END -->\n` if missing; never
 * overwrites an existing file. Resolves paths via the project roster.
 *
 * The 'created' array contains the labels of files that were actually
 * created, in canonical order: mailbox, archive, outbox. Useful for
 * diagnostics and idempotent callers.
 *
 * @concurrency No lock. Single-threaded use only (CLI / MCP tool calls).
 * Known TOCTOU window between `fs.existsSync` and `writeFileAtomic`:
 * under concurrent calls, two callers may both observe the file as
 * missing and both create it. Safe because the operation is idempotent
 * (only-if-missing, sentinel content is deterministic) — worst case is
 * a redundant write of `<!-- END -->\n`, which is a no-op. Do NOT use
 * in server / multi-process contexts without wrapping in `withFileLock`.
 * Cf. AGENTS.md L-004 and AGENT_USAGE.md:156 (Concurrency note).
 */
export function ensureMailboxFiles(input: EnsureMailboxFilesInput): EnsureMailboxFilesResult {
  const { project_handle, handle } = input;

  const paths = resolveMemberPaths(project_handle, handle);
  const mailboxPath = paths.mailbox_path;
  const archivePath = paths.archive_path;
  const outboxPath = paths.outbox_path;

  const created: string[] = [];
  const targets: Array<{ label: string; path: string }> = [
    { label: "mailbox", path: mailboxPath },
    { label: "archive", path: archivePath },
    { label: "outbox", path: outboxPath },
  ];

  for (const target of targets) {
    if (!fs.existsSync(target.path)) {
      writeFileAtomic(target.path, EMPTY_MAILBOX_CONTENT);
      created.push(target.label);
    }
  }

  return { created };
}
