import fs from "fs";
import path from "path";
import { PROJECTS_FILE, ROSTER_HEADER } from "../domain/constants";
import { writeFileAtomic } from "../lib/fs-atomic";
import { parseMarkdownTableRow } from "../lib/markdown";
import { ensureHumanInRoster } from "../lib/roster-utils";
import { handlesEqual } from "../lib/handles";
import { CreateProjectInput, CreateProjectResult } from "./types";
import { getCommonRoot, validateProjectsConfig } from "./util";

export function createMessagingProject(
  input: CreateProjectInput
): CreateProjectResult {
  const result: CreateProjectResult = {
    status: "ok",
    project_handle: input.project_handle,
    project_path: input.project_path,
    created: [],
    updated: [],
    warnings: [],
    errors: [],
  };

  const COMMON_ROOT = getCommonRoot();
  const projectPathMode = input.project_path_mode ?? "strict";
  const projectStatus = input.status ?? "active";
  const dryRun = input.dry_run ?? false;

  // Validate project_handle
  if (!input.project_handle || input.project_handle.trim() === "") {
    result.errors.push("project_handle is required and cannot be empty");
    result.status = "error";
    return result;
  }

  // Validate project_path is absolute
  if (!path.isAbsolute(input.project_path)) {
    result.errors.push(`project_path must be absolute: ${input.project_path}`);
    result.status = "error";
    return result;
  }

  // Cannot create COMMON via this script
  if (handlesEqual(input.project_handle, "COMMON")) {
    result.errors.push("COMMON cannot be created via this script. Use admin_bootstrap_common_messaging instead.");
    result.status = "error";
    return result;
  }

  // Check/create project path
  if (!fs.existsSync(input.project_path)) {
    if (projectPathMode === "strict") {
      result.errors.push(`project_path does not exist: ${input.project_path}`);
      result.status = "error";
      return result;
    } else {
      // create mode
      if (!dryRun) {
        fs.mkdirSync(input.project_path, { recursive: true });
      }
      result.warnings.push(`Created project directory: ${input.project_path}`);
    }
  }

  const projectsPath = path.join(COMMON_ROOT, PROJECTS_FILE);

  // Check projects_config.md exists
  if (!fs.existsSync(projectsPath)) {
    result.errors.push(`projects_config.md not found at ${projectsPath}. Run admin_bootstrap_common_messaging first.`);
    result.status = "error";
    return result;
  }

  // Validate existing projects_config.md
  const validation = validateProjectsConfig(projectsPath);
  if (validation === "empty") {
    result.errors.push(`projects_config.md exists but is empty. V1 does not repair existing files.`);
    result.status = "error";
    return result;
  } else if (validation === "malformed") {
    result.errors.push(`projects_config.md exists but has no valid header/table. V1 does not repair existing files.`);
    result.status = "error";
    return result;
  }

  // Check for duplicate project_handle
  const projectCheck = checkProjectExists(projectsPath, input.project_handle);
  if (projectCheck === "exists") {
    result.warnings.push(`Project ${input.project_handle} already exists in projects_config.md`);
    // Still continue to ensure roster exists
  } else if (projectCheck === "error") {
    result.errors.push(`Invalid entry found for ${input.project_handle} in projects_config.md`);
    result.status = "error";
    return result;
  }

  // Create roster.md in project if absent (must happen BEFORE projects_config.md
  // write so that ensureHumanInRoster has a roster to operate on; otherwise
  // a half-failed run leaves a project registered without a HUMAN roster entry).
  const rosterPath = path.join(input.project_path, "roster.md");
  if (!fs.existsSync(rosterPath)) {
    if (!dryRun) {
      writeFileAtomic(rosterPath, ROSTER_HEADER);
    }
    result.created.push("roster.md");
  }

  // V2.10: ensure HUMAN is part of the roster BEFORE we register the project,
  // so an ensureHumanInRoster failure prevents partial registration (natural
  // rollback: no project entry written, no roster mutated).
  if (!dryRun) {
    const added = ensureHumanInRoster(input.project_path, rosterPath);
    if (added) {
      result.updated.push("roster.md (HUMAN)");
    }
  }

  // Add project to projects_config.md if not exists
  if (projectCheck === "not_found") {
    if (!dryRun) {
      const entry = `| ${input.project_handle} | ${input.project_path} | ${rosterPath} | - | ${projectStatus} |\n`;
      const currentContent = fs.readFileSync(projectsPath, "utf-8");
      writeFileAtomic(projectsPath, currentContent + entry);
    }
    result.updated.push(PROJECTS_FILE);
  }

  // Adjust status
  if (result.errors.length > 0) {
    result.status = "error";
  } else if (result.warnings.length > 0) {
    result.status = "warning";
  }

  return result;
}

function checkProjectExists(
  projectsPath: string,
  projectHandle: string
): "exists" | "not_found" | "error" {
  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  const projectLine = lines.find(l => {
    const parts = parseMarkdownTableRow(l);
    return handlesEqual(parts[0], projectHandle);
  });

  if (!projectLine) {
    return "not_found";
  }

  // Validate existing entry
  const parts = parseMarkdownTableRow(projectLine);
  if (parts.length < 2) {
    return "error";
  }

  return "exists";
}
