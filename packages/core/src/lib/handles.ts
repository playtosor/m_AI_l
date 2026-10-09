/**
 * V2.11: handle normalization & case-insensitive comparison.
 *
 * Convention: every handle and project handle in the messaging_core_helpers
 * universe is uppercase, end-to-end (Zod input, roster storage, path
 * resolution, admin gates). This module is the single source of truth for
 * that normalization so changes can be made in one place.
 *
 * Lowercase or mixed-case input from callers is silently normalised, never
 * rejected. This matches the brief: handles should be "robust to typos"
 * rather than strict.
 */

/**
 * V3.0 BAC 2A — S5: strict handle syntactic validator.
 *
 * Allowed: uppercase letters, lowercase letters, digits, underscore.
 * Length: 1..63 (matches DOS-era MAX_PATH basename safety margin).
 *
 * V2.11 already dictates uppercase end-to-end and silent lowercase
 * coercion. V3.0 BAC 2A adds defense-in-depth: callers that create a
 * handle (upsert-handle, rename-handle, register) must call
 * `assertValidHandleSyntax` BEFORE `normalizeHandle` so an obviously
 * malicious input (e.g. `../../etc/passwd`, `foo;bar`, `a b`) is rejected
 * upstream. `normalizeHandle` remains permissive to preserve the V2.11
 * contract; this validator is an explicit, opt-in check.
 */
export const HANDLE_SYNTAX_RE = /^[A-Za-z0-9_]{1,63}$/;

/**
 * Returns true when `value` (after trim) matches the canonical handle
 * syntax. Empty / whitespace-only inputs are rejected.
 */
export function isValidHandleSyntax(value: string | null | undefined): boolean {
  if (!value) return false;
  return HANDLE_SYNTAX_RE.test(value.trim());
}

/**
 * Throws when `value` fails the canonical handle syntax check. Use this
 * at API boundaries that create a handle (register / rename / upsert).
 */
export function assertValidHandleSyntax(value: string | null | undefined): void {
  if (!isValidHandleSyntax(value)) {
    throw new Error(
      `Invalid handle syntax: expected [A-Za-z0-9_]{1,63} (after trim), got ${JSON.stringify(value)}`
    );
  }
}

/**
 * Normalize a handle to the canonical UPPERCASE trimmed form.
 * Returns the input unchanged if it is null, undefined, or empty (so
 * callers can pipe optional values through safely).
 */
export function normalizeHandle(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toUpperCase();
}

/**
 * Strict case-insensitive equality for two handles. Treats nullish or
 * empty strings as non-equal to a non-empty handle, so this function
 * never returns true for two unrelated invalid inputs.
 */
export function handlesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeHandle(a);
  const nb = normalizeHandle(b);
  if (!na && !nb) return true; // both empty/nullish → equal (idempotent)
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Parse a qualified handle string of the form "PROJECT/HANDLE" into its
 * project prefix (when a single `/` is present and not at position 0) and
 * the bare handle. Used at tool boundaries (mail tool sender / recipient /
 * handle) so callers can pass either the bare handle or the qualified
 * PROJECT/HANDLE reference and have it match the canonical roster entry.
 *
 * Behavior:
 *   - "PROJECT/HANDLE" → { project: "PROJECT", handle: "HANDLE" }
 *   - "PROJECT/"       → treated as a malformed qualifier; the entire
 *                        string is returned as the bare handle and the
 *                        project is `undefined` (the `/` is not a typo
 *                        we should silently swallow).
 *   - "/HANDLE"        → same: the leading `/` is preserved in the bare
 *                        handle.
 *   - "HANDLE"         → { project: undefined, handle: "HANDLE" }
 *   - ""               → { project: undefined, handle: "" }
 *
 * Both fields are normalized through `normalizeHandle` (trim + uppercase)
 * so downstream callers can compare against canonical roster entries
 * without re-normalizing.
 *
 * This is the public counterpart of the private `parseQualifiedSender`
 * helper in `src/coordinateur-helpers/index.ts`. The two stay in sync; if
 * the parsing rules ever change, update both.
 */
export interface QualifiedHandle {
  project: string | undefined;
  handle: string;
}

export function parseQualifiedHandle(value: string | null | undefined): QualifiedHandle {
  if (!value) return { project: undefined, handle: "" };
  const trimmed = value.trim();
  const idx = trimmed.indexOf("/");
  if (idx <= 0 || idx === trimmed.length - 1) {
    return { project: undefined, handle: normalizeHandle(trimmed) };
  }
  return {
    project: normalizeHandle(trimmed.substring(0, idx)),
    handle: normalizeHandle(trimmed.substring(idx + 1)),
  };
}
