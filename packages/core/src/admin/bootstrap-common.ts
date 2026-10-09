import fs from "fs";
import path from "path";
import { PROJECTS_FILE, ROSTER_HEADER } from "../domain/constants";
import { writeFileAtomic } from "../lib/fs-atomic";
import { parseMarkdownTableRow } from "../lib/markdown";
import { handlesEqual } from "../lib/handles";
import { ensureHumanInRoster } from "../lib/roster-utils";
import { getProjects } from "../repositories/projects-repo";
import { BootstrapCommonInput, BootstrapCommonResult } from "./types";
import { getCommonRoot, validateProjectsConfig } from "./util";

const PROJECTS_ARCHIVE_FILE = "projects_config_archive.md";

export function bootstrapCommonMessaging(
  input: BootstrapCommonInput = {}
): BootstrapCommonResult {
  const COMMON_ROOT = getCommonRoot();
  const result: BootstrapCommonResult = {
    status: "ok",
    common_path: COMMON_ROOT,
    created: [],
    updated: [],
    warnings: [],
    errors: [],
  };

  const ensureCommonEntry = input.ensure_common_entry ?? true;
  const dryRun = input.dry_run ?? false;

  // Check COMMON_PATH exists
  if (!fs.existsSync(COMMON_ROOT)) {
    result.errors.push(`COMMON_PATH does not exist: ${COMMON_ROOT}`);
    result.status = "error";
    return result;
  }

  const projectsPath = path.join(COMMON_ROOT, PROJECTS_FILE);
  const projectsArchivePath = path.join(COMMON_ROOT, PROJECTS_ARCHIVE_FILE);
  const rosterPath = path.join(COMMON_ROOT, "roster.md");

  // Create projects_config.md if absent
  if (!fs.existsSync(projectsPath)) {
    if (!dryRun) {
      const header = "| name | path | roster | language | status |\n|------|------|--------|----------|--------|\n";
      writeFileAtomic(projectsPath, header);
    }
    result.created.push(PROJECTS_FILE);
  } else {
    // Validate existing projects_config.md
    const validation = validateProjectsConfig(projectsPath);
    if (validation === "empty") {
      result.errors.push(`${PROJECTS_FILE} exists but is empty. V1 does not repair existing files.`);
      result.status = "error";
      return result;
    } else if (validation === "malformed") {
      result.errors.push(`${PROJECTS_FILE} exists but has no valid header/table. V1 does not repair existing files.`);
      result.status = "error";
      return result;
    }
  }

  // Create projects_config_archive.md if absent
  if (!fs.existsSync(projectsArchivePath)) {
    if (!dryRun) {
      writeFileAtomic(projectsArchivePath, "");
    }
    result.created.push(PROJECTS_ARCHIVE_FILE);
  }

  // Add COMMON entry to projects_config.md if needed
  if (ensureCommonEntry) {
    const commonEntryAdded = ensureCommonEntryInProjects(projectsPath, COMMON_ROOT, dryRun);
    if (commonEntryAdded === "created") {
      result.updated.push(PROJECTS_FILE);
    } else if (commonEntryAdded === "error") {
      result.errors.push(`COMMON entry exists but is invalid in ${PROJECTS_FILE}`);
      result.status = "error";
      return result;
    }
  }

  // Create roster.md in COMMON if absent
  if (!fs.existsSync(rosterPath)) {
    if (!dryRun) {
      writeFileAtomic(rosterPath, ROSTER_HEADER);
    }
    result.created.push("roster.md");
  }

  // V2.9: ensure HUMAN is present in COMMON roster (idempotent migration).
  if (!dryRun && fs.existsSync(rosterPath)) {
    const added = ensureHumanInRoster(COMMON_ROOT, rosterPath);
    if (added) {
      result.updated.push("roster.md (HUMAN)");
    }
  }

  // V2.9: migrate every existing project roster — ensureHumanInRoster is
  // idempotent so re-running bootstrap safely converges every project to a
  // roster that contains a canonical HUMAN entry.
  if (!dryRun) {
    try {
      const projects = getProjects();
      for (const project of projects) {
        if (!project.path || project.path === COMMON_ROOT) continue;
        const added = ensureHumanInRoster(project.path, project.roster);
        if (added) {
          result.updated.push(`${project.name} (HUMAN)`);
        }
      }
    } catch (error) {
      result.warnings.push(`Failed to migrate existing project rosters: ${(error as Error).message}`);
    }
  }

  // Adjust status based on actions
  if (result.errors.length > 0) {
    result.status = "error";
  } else if (result.warnings.length > 0) {
    result.status = "warning";
  }

  return result;
}

function ensureCommonEntryInProjects(
  projectsPath: string,
  commonRoot: string,
  dryRun: boolean
): "none" | "created" | "error" {
  if (!fs.existsSync(projectsPath)) {
    return "none";
  }

  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  // Check if COMMON already exists
  const commonLine = lines.find(l => {
    const parts = parseMarkdownTableRow(l);
    return handlesEqual(parts[0], "COMMON");
  });

  if (commonLine) {
    // Validate existing COMMON entry
    const parts = parseMarkdownTableRow(commonLine);
    if (parts.length < 2) {
      return "error";
    }
    return "none";
  }

  // Add COMMON entry
  if (!dryRun) {
    const rosterPath = path.join(commonRoot, "roster.md");
    const commonEntry = `| COMMON | ${commonRoot} | ${rosterPath} | - | active |\n`;
    writeFileAtomic(projectsPath, content + commonEntry);
  }
  return "created";
}
