import { ReadRecentArchiveResult } from "../domain/types";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { readMailboxSnapshotFromPath } from "../repositories/mailbox-repo";
import { resolveArchivePathFromMailboxPath, resolveMemberMailboxPath } from "./mail-routing";
import { resolveHandleCandidatesService } from "./resolve-handle-candidates";

export function readRecentArchiveService(
  handle: string,
  limit: number = 1,
  currentProjectHandle?: string,
  cwd?: string
): ReadRecentArchiveResult {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const resolution = resolveHandleCandidatesService(handle, currentProjectHandle, cwd);

  if (resolution.candidates.length === 0) {
    return {
      status: "not_found",
      handle,
      limit: boundedLimit,
      resolution_scope_used: resolution.resolution_scope_used,
      count: 0,
      messages: [],
      candidates: [],
    };
  }

  if (resolution.candidates.length > 1) {
    return {
      status: "ambiguous",
      handle,
      limit: boundedLimit,
      resolution_scope_used: resolution.resolution_scope_used,
      count: 0,
      messages: [],
      candidates: resolution.candidates,
    };
  }

  const resolvedCandidate = resolution.candidates[0];
  const project = getProject(resolvedCandidate.project_handle);
  const roster = getRoster(project.path, project.roster);
  const mailboxPath = resolveMemberMailboxPath(project.path, roster, handle);
  const archivePath = resolveArchivePathFromMailboxPath(mailboxPath);
  const snapshot = readMailboxSnapshotFromPath(archivePath);
  const messages = snapshot.messages.slice(-boundedLimit).reverse();

  return {
    status: "ok",
    handle,
    limit: boundedLimit,
    resolved_project_handle: resolvedCandidate.project_handle,
    resolution_scope_used: resolution.resolution_scope_used,
    count: messages.length,
    messages,
    invalid_count: snapshot.invalid_lines.length,
    warning_count: snapshot.warning_count,
    candidates: [resolvedCandidate],
  };
}
