import crypto from "crypto";
import fs from "fs";
import path from "path";
import { writeFileAtomic } from "../lib/fs-atomic";
import { resetFileWithSentinel } from "../lib/sentinel";
import { handlesEqual } from "../lib/handles";
import { SENTINEL } from "../domain/constants";
import { getCutoffDate, scanProject } from "../lib/prune-common";
import { getProjects, getProject } from "../repositories/projects-repo";
import { pruneActivityLog } from "../lib/activity-log";
import type {
  PruneInput,
  PruneProjectResult,
  PruneResult,
} from "./types";

function shortHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").substring(0, 16);
}

function resolveProjectPath(projectHandle: string): string | null {
  try {
    return getProject(projectHandle).path;
  } catch {
    return null;
  }
}

function getPrunedDir(projectPath: string): string {
  return path.join(projectPath, "pruned");
}

function ensurePrunedDir(projectPath: string): string {
  const prunedDir = getPrunedDir(projectPath);
  if (!fs.existsSync(prunedDir)) {
    fs.mkdirSync(prunedDir, { recursive: true });
  }
  return prunedDir;
}

function moveEntriesToPruned(
  projectPath: string,
  filePath: string,
  cutoffLineIndex: number | null,
  lines: string[],
  dryRun: boolean
): { moved: boolean; action: string } {
  const filename = path.basename(filePath);

  const linesToMove =
    cutoffLineIndex === null ? lines : lines.slice(0, cutoffLineIndex);
  const linesToKeep =
    cutoffLineIndex === null ? [] : lines.slice(cutoffLineIndex);

  if (dryRun) {
    return {
      moved: false,
      action: `would_move_partial:${filename}`,
    };
  }

  const prunedDir = ensurePrunedDir(projectPath);
  const prunedPath = path.join(prunedDir, filename);

  // Idempotency: a batch marker (hash of linesToMove) is appended to the
  // pruned file. If the marker is already present, the entries were moved
  // in a previous run that crashed mid-way — just truncate the source and
  // skip the pruned append to avoid duplicate entries.
  const batchMarker = `<!-- PRUNE-BATCH:${shortHash(linesToMove.join("\n"))} -->`;
  const existingPruned = fs.existsSync(prunedPath) ? fs.readFileSync(prunedPath, "utf8") : "";
  const alreadyMoved = existingPruned.includes(batchMarker);

  if (!alreadyMoved) {
    const prunedContent = existingPruned
      ? `${existingPruned}${linesToMove.join("\n")}\n${batchMarker}\n`
      : `${linesToMove.join("\n")}\n${batchMarker}\n`;
    writeFileAtomic(prunedPath, prunedContent);
  }

  if (linesToKeep.length > 0) {
    const keptContent = `${linesToKeep.join("\n")}\n${SENTINEL}\n`;
    writeFileAtomic(filePath, keptContent);
  } else {
    resetFileWithSentinel(filePath);
  }

  return {
    moved: true,
    action: `moved_partial:${filename}`,
  };
}

export function adminPruneMessaging(input: PruneInput = {}): PruneResult {
  const retentionDays = input.retention_days ?? 30;
  const dryRun = input.dry_run ?? true;
  const includeCommon = input.include_common ?? true;

  let targetProjects: Array<{ handle: string; path: string }> = [];

  if (input.project_handle) {
    const projectPath = resolveProjectPath(input.project_handle);
    if (!projectPath) {
      return {
        status: "error",
        retention_days: retentionDays,
        projects: [],
        warnings: [],
        errors: [`Projet introuvable dans projects_config.md : ${input.project_handle}`],
      };
    }
    targetProjects = [{ handle: input.project_handle, path: projectPath }];
  } else {
    let allProjects;
    try {
      allProjects = getProjects().filter(p => p.status === "active");
    } catch (error) {
      return {
        status: "error",
        retention_days: retentionDays,
        projects: [],
        warnings: [],
        errors: [`projects_config.md illisible : ${error instanceof Error ? error.message : String(error)}`],
      };
    }
    if (includeCommon) {
      const commonProject = allProjects.find(p => handlesEqual(p.name, "COMMON"));
      if (commonProject) {
        targetProjects.push({ handle: commonProject.name, path: commonProject.path });
      }
    }
    targetProjects = targetProjects.concat(
      allProjects
        .filter(p => !handlesEqual(p.name, "COMMON"))
        .map(p => ({ handle: p.name, path: p.path }))
    );
  }

  const cutoffDate = getCutoffDate(retentionDays);
  const warnings: string[] = [];
  const errors: string[] = [];
  const projects: PruneProjectResult[] = [];

  for (const project of targetProjects) {
    if (!fs.existsSync(project.path)) {
      warnings.push(`Répertoire introuvable, ignoré : ${project.path}`);
      continue;
    }

    const scanResult = scanProject(project, cutoffDate);
    const projectResult: PruneProjectResult = {
      project_handle: project.handle,
      project_path: project.path,
      files_scanned: scanResult.files.length,
      files_flagged: 0,
      entries_to_move: 0,
      entries_to_keep: 0,
      actions: [],
    };

    if (scanResult.error) {
      errors.push(`${project.handle}: ${scanResult.error}`);
      continue;
    }

    for (const fileReport of scanResult.files) {
      if (fileReport.flagged === "error") {
        errors.push(`${project.handle}/${fileReport.filename}: ${fileReport.error}`);
        continue;
      }

      if (fileReport.flagged === "has_old_entries") {
        projectResult.files_flagged++;
        const { action } = moveEntriesToPruned(
          project.path,
          fileReport.path,
          fileReport.cutoffLineIndex,
          fileReport.lines ?? [],
          dryRun
        );
        projectResult.actions.push(action);
      }
    }

    // Use the aggregates already computed by scanProject (single source of
    // truth, no double-counting risk).
    projectResult.entries_to_move = scanResult.totalToMove;
    projectResult.entries_to_keep = scanResult.totalToKeep;

    projects.push(projectResult);
  }

  // D4: the cross-project activity log shares the mailbox prune retention
  // window. Best-effort and only mutates on a real run (dry_run honoured).
  pruneActivityLog(retentionDays, dryRun);

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const status: PruneResult["status"] = hasErrors ? "error" : hasWarnings ? "warning" : "ok";

  return {
    status,
    retention_days: retentionDays,
    projects,
    warnings,
    errors,
  };
}
