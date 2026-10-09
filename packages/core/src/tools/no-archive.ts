/**
 * Coerce an unknown `no_archive` value into a boolean.
 *
 * The mailbox tool schema declares `no_archive` as `string`
 * (src/tools/mailbox.ts:125), but mailbox-triggers.md documents the boolean
 * form `no_archive: true`. Both must be honoured: only the exact lowercase
 * string "true" (or a real boolean `true`) means "peek without archiving";
 * every other value (false, "false", undefined, "True", "1", ...) archives by
 * default.
 *
 * Kept in its own module (rather than inline in mailbox.ts) so it can be
 * unit-tested without importing the OpenCode plugin tool, which is excluded
 * from the tsconfig and relies on `import.meta.url`.
 *
 * NOTE: mailbox.ts also carries an INLINED copy of this exact function. Reason:
 * postbuild.js (step 3) copies mailbox.ts verbatim to ~/.config/opencode/tools/
 * without its sibling modules, so a runtime `import "./no-archive"` would fail
 * to resolve in the plugin runtime and crash OpenCode on load. The two copies
 * MUST stay identical (single-line body). This module remains the tested source.
 */
export function coerceNoArchive(value: unknown): boolean {
  return String(value) === "true";
}
