/**
 * Status helpers — single source of truth for "active" / "inactive" parsing.
 *
 * Both helpers:
 * - tolerate leading/trailing whitespace
 * - are case-insensitive
 * - treat a missing/empty/undefined status as active by default (the historical
 *   convention used everywhere in this codebase — projects/handles without an
 *   explicit status were considered live).
 */

export function isProjectActive(project: { status?: string } | null | undefined): boolean {
  if (!project) return false;
  const status = project.status;
  if (!status || status.trim() === "") return true;
  return status.trim().toLowerCase() === "active";
}

export function isHandleActive(handle: { status?: string } | null | undefined): boolean {
  if (!handle) return false;
  const status = handle.status;
  if (!status || status.trim() === "") return true;
  return status.trim().toLowerCase() === "active";
}
