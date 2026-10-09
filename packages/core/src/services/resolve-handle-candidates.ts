import { getProjects, getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { resolveMailboxPathFromValue } from "./mail-routing";
import { isProjectActive, isHandleActive } from "../lib/project-status";
import { handlesEqual } from "../lib/handles";
import { HandleResolutionCandidate, HandleResolutionResult, ProjectEntry, RosterEntry } from "../domain/types";
import { FileOperationError } from "../domain/errors";
import path from "path";
import fs from "fs";

interface CurrentProjectContext {
  project?: ProjectEntry;
  source: "explicit" | "cwd" | "none";
}

export function resolveHandleCandidatesService(
  targetHandle: string,
  currentProjectHandle?: string,
  cwd?: string
): HandleResolutionResult {
  const currentProject = resolveCurrentProjectContext(currentProjectHandle, cwd);

  // Projects whose roster could not be read during the global fallback scan.
  // Surfaced in every return site so callers can tell "not found anywhere"
  // apart from "some projects were never scanned" (SIMPLIFY #12).
  const skippedProjects: string[] = [];

  const currentProjectMatch = currentProject.project
    ? findProjectHandleCandidates(currentProject.project, targetHandle)
    : [];
  if (currentProjectMatch.length > 0) {
    return {
      query_handle: targetHandle,
      current_project_handle: currentProject.project?.name,
      current_project_source: currentProject.source,
      resolution_scope_used: "current_project",
      candidates: currentProjectMatch,
      skipped_projects: skippedProjects,
    };
  }

  const allProjects = getProjects().filter(project => isProjectActive(project));
  const commonProject = findCommonProject(allProjects, currentProject.project?.name);
  const commonMatch = commonProject ? tryFindProjectHandleCandidates(commonProject, targetHandle) : [];
  if (commonMatch.length > 0) {
    return {
      query_handle: targetHandle,
      current_project_handle: currentProject.project?.name,
      current_project_source: currentProject.source,
      resolution_scope_used: "common",
      candidates: commonMatch,
      skipped_projects: skippedProjects,
    };
  }

  // V2.5 SIMPLIFY WS4 — Finding #9: pre-load all eligible project rosters
  // once instead of triggering a fresh fs read per project in the flatMap.
  // Project path is the map key (project.path is unique per active project).
  const rostersByPath = new Map<string, RosterEntry[]>();
  for (const project of allProjects) {
    if (project.name === currentProject.project?.name) continue;
    if (project.name === commonProject?.name) continue;
    try {
      rostersByPath.set(project.path, getRoster(project.path, project.roster));
    } catch {
      // Skip projects whose roster can't be read; mirrors the historical
      // `tryFindProjectHandleCandidates` swallow behaviour. Record the
      // project name so the gap is visible to the caller (SIMPLIFY #12).
      skippedProjects.push(project.name);
    }
  }

  const globalMatches = allProjects
    .filter(project => project.name !== currentProject.project?.name)
    .filter(project => project.name !== commonProject?.name)
    .flatMap(project => {
      const roster = rostersByPath.get(project.path);
      if (!roster) return [];
      return roster
        .filter(entry => isHandleActive(entry))
        .filter(entry => handlesEqual(entry.handle, targetHandle))
        .map(entry => toResolutionCandidate(project, entry));
    });

  if (globalMatches.length === 1) {
    return {
      query_handle: targetHandle,
      current_project_handle: currentProject.project?.name,
      current_project_source: currentProject.source,
      resolution_scope_used: "global",
      candidates: globalMatches,
      skipped_projects: skippedProjects,
    };
  }

  if (globalMatches.length > 1) {
    return {
      query_handle: targetHandle,
      current_project_handle: currentProject.project?.name,
      current_project_source: currentProject.source,
      resolution_scope_used: "ambiguous",
      candidates: globalMatches,
      skipped_projects: skippedProjects,
    };
  }

  return {
    query_handle: targetHandle,
    current_project_handle: currentProject.project?.name,
    current_project_source: currentProject.source,
    resolution_scope_used: "none",
    candidates: [],
    skipped_projects: skippedProjects,
  };
}

function resolveCurrentProjectContext(currentProjectHandle?: string, cwd?: string): CurrentProjectContext {
  if (currentProjectHandle) {
    return {
      project: getProject(currentProjectHandle),
      source: "explicit",
    };
  }

  const currentProject = resolveCurrentProjectFromCwd(cwd ?? process.cwd());
  if (currentProject) {
    return {
      project: currentProject,
      source: "cwd",
    };
  }

  return {
    source: "none",
  };
}

/**
 * V3.0 BAC 2A — S7: strict cwd validation.
 *
 * The `cwd` value flows directly into `path.resolve(cwd)` (line 104) and
 * from there into filesystem matching against every active project.
 * Without an upfront validation, a caller could pass a relative path,
 * a symlink that points outside any project, or a non-existent directory
 * and trigger undefined behaviour in project matching.
 *
 * Three guards applied:
 *   1. `path.isAbsolute()` — relative paths are rejected (relative paths
 *      would resolve against `process.cwd()`, which is non-deterministic
 *      for an MCP server).
 *   2. `path.resolve()` — canonicalizes `..` segments and normalises
 *      separators before further comparison.
 *   3. `fs.existsSync()` — one final filesystem check so callers fail
 *      fast rather than silently matching against a stale or missing cwd.
 *
 * Throws `FileOperationError` to keep the failure mode consistent with
 * the rest of the routing layer.
 */
function assertCwdIsAbsoluteExistingDir(cwd: string): void {
  if (!path.isAbsolute(cwd)) {
    throw new FileOperationError(`cwd must be an absolute path: ${cwd}`);
  }
  const resolved = path.resolve(cwd);
  if (!fs.existsSync(resolved)) {
    throw new FileOperationError(`cwd does not exist: ${cwd} (resolved: ${resolved})`);
  }
}

function resolveCurrentProjectFromCwd(cwd: string): ProjectEntry | undefined {
  // S7: fail fast on non-absolute, missing, or non-canonical cwd values.
  assertCwdIsAbsoluteExistingDir(cwd);
  const normalizedCwd = normalizePath(cwd);

  const matches = getProjects()
    .filter(project => isProjectActive(project))
    .filter(project => isSameOrDescendantPath(normalizePath(project.path), normalizedCwd))
    .sort((left, right) => normalizePath(right.path).length - normalizePath(left.path).length);

  return matches[0];
}

function findCommonProject(projects: ProjectEntry[], currentProjectName?: string): ProjectEntry | undefined {
  return projects.find(project => handlesEqual(project.name, "COMMON") && isProjectActive(project) && project.name !== currentProjectName);
}

function findProjectHandleCandidates(project: ProjectEntry, targetHandle: string): HandleResolutionCandidate[] {
  const roster = getRoster(project.path, project.roster);

  return roster
    .filter(entry => isHandleActive(entry))
    .filter(entry => handlesEqual(entry.handle, targetHandle))
    .map(entry => toResolutionCandidate(project, entry));
}

function tryFindProjectHandleCandidates(project: ProjectEntry, targetHandle: string): HandleResolutionCandidate[] {
  try {
    return findProjectHandleCandidates(project, targetHandle);
  } catch (error) {
    if (error instanceof FileOperationError) {
      return [];
    }

    throw error;
  }
}

function toResolutionCandidate(project: ProjectEntry, entry: RosterEntry): HandleResolutionCandidate {
  return {
    project_handle: project.name,
    project_path: project.path,
    handle: entry.handle,
    role: entry.role,
    status: entry.status,
    mailbox: entry.mailbox,
    resolved_mailbox: resolveMailboxPathFromValue(project.path, entry.handle, entry.mailbox),
  };
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
}

function isSameOrDescendantPath(basePath: string, targetPath: string): boolean {
  return targetPath === basePath || targetPath.startsWith(`${basePath}${path.sep.toLowerCase()}`);
}
