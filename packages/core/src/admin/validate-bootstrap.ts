import fs from "fs";
import path from "path";
import { PROJECTS_FILE } from "../domain/constants";
import { parseMarkdownTableRow } from "../lib/markdown";
import { handlesEqual } from "../lib/handles";
import { ValidateInput, ValidateResult, CheckResult } from "./types";
import { getCommonRoot, validateProjectsConfig } from "./util";

const PROJECTS_ARCHIVE_FILE = "projects_config_archive.md";

export function validateMessagingBootstrap(
  input: ValidateInput = {}
): ValidateResult {
  const result: ValidateResult = {
    status: "ok",
    created: [],
    updated: [],
    warnings: [],
    errors: [],
    checks: [],
  };

  const COMMON_ROOT = getCommonRoot();

  // Check 1: projects_config.md exists
  const projectsPath = path.join(COMMON_ROOT, PROJECTS_FILE);
  const check1: CheckResult = {
    name: "projects_config_exists",
    status: fs.existsSync(projectsPath) ? "ok" : "error",
    details: fs.existsSync(projectsPath)
      ? `projects_config.md found at ${projectsPath}`
      : `projects_config.md not found at ${projectsPath}`,
  };
  result.checks.push(check1);

  // Check 2: projects_config.md is readable
  if (check1.status === "ok") {
    const check2: CheckResult = {
      name: "projects_config_readable",
      status: "ok",
      details: "projects_config.md is readable",
    };
    try {
      const content = fs.readFileSync(projectsPath, "utf-8");
      if (content.trim().length === 0) {
        check2.status = "error";
        check2.details = "projects_config.md is empty";
      } else {
        check2.details = "projects_config.md is readable";
      }
    } catch (e) {
      check2.status = "error";
      check2.details = `Cannot read projects_config.md: ${e}`;
    }
    result.checks.push(check2);
  }

  // Check 3: COMMON entry exists and is valid
  if (result.checks[0]?.status === "ok") {
    const check3: CheckResult = {
      name: "common_entry_valid",
      status: "ok",
      details: "COMMON entry is valid",
    };
    const commonCheck = validateCommonEntry(projectsPath);
    if (commonCheck === "not_found") {
      check3.status = "warning";
      check3.details = "COMMON entry not found in projects_config.md";
    } else if (commonCheck === "error") {
      check3.status = "error";
      check3.details = "COMMON entry exists but is invalid";
    } else {
      check3.details = "COMMON entry is valid";
    }
    result.checks.push(check3);
  }

  // Check 4: projects_config_archive.md exists
  const projectsArchivePath = path.join(COMMON_ROOT, PROJECTS_ARCHIVE_FILE);
  const check4: CheckResult = {
    name: "projects_config_archive_exists",
    status: fs.existsSync(projectsArchivePath) ? "ok" : "warning",
    details: fs.existsSync(projectsArchivePath)
      ? "projects_config_archive.md found"
      : "projects_config_archive.md not found",
  };
  result.checks.push(check4);

  // Check 5: COMMON/roster.md exists
  const rosterPath = path.join(COMMON_ROOT, "roster.md");
  const check5: CheckResult = {
    name: "common_roster_exists",
    status: fs.existsSync(rosterPath) ? "ok" : "warning",
    details: fs.existsSync(rosterPath)
      ? "COMMON/roster.md found"
      : "COMMON/roster.md not found",
  };
  result.checks.push(check5);

  // Check 6: No duplicate project_handle
  if (result.checks[0]?.status === "ok") {
    const check6: CheckResult = {
      name: "no_duplicate_handles",
      status: "ok",
      details: "No duplicate project handles",
    };
    const duplicateCheck = checkDuplicateHandles(projectsPath);
    if (duplicateCheck.length > 0) {
      check6.status = "error";
      check6.details = `Duplicate project handles found: ${duplicateCheck.join(", ")}`;
    } else {
      check6.details = "No duplicate project handles";
    }
    result.checks.push(check6);
  }

  // Check specific project if provided
  if (input.project_handle) {
    const projectCheck: CheckResult = {
      name: `project_${input.project_handle}_valid`,
      status: "ok",
      details: `Project ${input.project_handle} is valid`,
    };
    const projectValidation = validateProjectEntry(projectsPath, input.project_handle);
    if (projectValidation === "not_found") {
      projectCheck.status = "error";
      projectCheck.details = `Project ${input.project_handle} not found in projects_config.md`;
    } else if (projectValidation === "error") {
      projectCheck.status = "error";
      projectCheck.details = `Project ${input.project_handle} entry is invalid`;
    } else if (projectValidation === "path_not_absolute") {
      projectCheck.status = "error";
      projectCheck.details = `Project ${input.project_handle} path is not absolute`;
    } else {
      projectCheck.details = `Project ${input.project_handle} is valid`;
    }
    result.checks.push(projectCheck);

    // Check project roster exists
    if (projectValidation === "ok") {
      const projectPath = getProjectPath(projectsPath, input.project_handle);
      if (projectPath) {
        const projectRosterPath = path.join(projectPath, "roster.md");
        const rosterCheck: CheckResult = {
          name: `project_${input.project_handle}_roster_exists`,
          status: fs.existsSync(projectRosterPath) ? "ok" : "warning",
          details: fs.existsSync(projectRosterPath)
            ? `roster.md found in ${projectPath}`
            : `roster.md not found in ${projectPath}`,
        };
        result.checks.push(rosterCheck);
      }
    }
  }

  // Compute overall status
  const hasErrors = result.checks.some(c => c.status === "error");
  const hasWarnings = result.checks.some(c => c.status === "warning");

  if (hasErrors) {
    result.status = "error";
    result.errors = result.checks
      .filter(c => c.status === "error")
      .map(c => c.details || c.name);
  } else if (hasWarnings) {
    result.status = "warning";
    result.warnings = result.checks
      .filter(c => c.status === "warning")
      .map(c => c.details || c.name);
  }

  return result;
}

function validateCommonEntry(projectsPath: string): "ok" | "not_found" | "error" {
  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  const commonLine = lines.find(l => {
    const parts = parseMarkdownTableRow(l);
    return handlesEqual(parts[0], "COMMON");
  });

  if (!commonLine) {
    return "not_found";
  }

  const parts = parseMarkdownTableRow(commonLine);
  if (parts.length < 2) {
    return "error";
  }

  return "ok";
}

function checkDuplicateHandles(projectsPath: string): string[] {
  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  const handles: string[] = [];
  const duplicates: string[] = [];

  for (const line of lines) {
    const parts = parseMarkdownTableRow(line);
    if (parts.length >= 2 && !isHeaderOrSeparator(parts)) {
      const handle = parts[0];
      if (handles.includes(handle) && !duplicates.includes(handle)) {
        duplicates.push(handle);
      }
      handles.push(handle);
    }
  }

  return duplicates;
}

function validateProjectEntry(
  projectsPath: string,
  projectHandle: string
): "ok" | "not_found" | "error" | "path_not_absolute" {
  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  const projectLine = lines.find(l => {
    const parts = parseMarkdownTableRow(l);
    return handlesEqual(parts[0], projectHandle);
  });

  if (!projectLine) {
    return "not_found";
  }

  const parts = parseMarkdownTableRow(projectLine);
  if (parts.length < 2) {
    return "error";
  }

  const projectPath = parts[1];
  if (!path.isAbsolute(projectPath)) {
    return "path_not_absolute";
  }

  return "ok";
}

function getProjectPath(projectsPath: string, projectHandle: string): string | null {
  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.startsWith("|"));

  const projectLine = lines.find(l => {
    const parts = parseMarkdownTableRow(l);
    return handlesEqual(parts[0], projectHandle);
  });

  if (!projectLine) {
    return null;
  }

  const parts = parseMarkdownTableRow(projectLine);
  return parts.length >= 2 ? parts[1] : null;
}

function isHeaderOrSeparator(parts: string[]): boolean {
  if (parts.length === 0) return true;
  const first = parts[0].toLowerCase();
  return (
    first === "name" ||
    first === "project" ||
    first.includes("---") ||
    first.includes("===")
  );
}
