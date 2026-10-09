import { ProjectEntry } from "../domain/types";
import { getProjectsPath } from "../lib/paths";
import { FileOperationError, ProjectNotFoundError } from "../domain/errors";
import { parseMarkdownTableRow, isMarkdownSeparatorRow } from "../lib/markdown";
import { handlesEqual } from "../lib/handles";
import fs from "fs";

export function getProjects(): ProjectEntry[] {
  const projectsPath = getProjectsPath();
  if (!fs.existsSync(projectsPath)) {
    throw new FileOperationError(`Projects file not found: ${projectsPath}`);
  }
  
  const content = fs.readFileSync(projectsPath, "utf-8");
  const lines = content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "" && line.startsWith("|"))
    .filter(line => !isMarkdownSeparatorRow(line))
    .filter(line => !isProjectsHeaderRow(line));
  
  return lines.map(line => parseProjectEntry(line));
}

export function getProject(projectHandle: string): ProjectEntry {
  const project = getProjects().find(entry => handlesEqual(entry.name, projectHandle));

  if (!project) {
    throw new ProjectNotFoundError(projectHandle);
  }

  return project;
}

function parseProjectEntry(line: string): ProjectEntry {
  const parts = parseMarkdownTableRow(line);
  if (parts.length < 2) {
    throw new Error(`Invalid project entry format: ${line}`);
  }

  if (parts.length >= 5) {
    return {
      name: parts[0],
      path: parts[1],
      roster: parts[2],
      language: parts[3],
      status: normalizeProjectStatus(parts[4]),
    };
  }

  return {
    name: parts[0],
    path: parts[1],
    status: parts.length > 2 ? normalizeProjectStatus(parts[2]) : undefined,
  };
}

function normalizeProjectStatus(raw: string): "active" | "inactive" {
  return raw === "inactive" ? "inactive" : "active";
}

function isProjectsHeaderRow(line: string): boolean {
  const parts = parseMarkdownTableRow(line);
  if (parts.length < 2) {
    return false;
  }

  return parts[0].toLowerCase().includes("project") && parts[1].toLowerCase().includes("path");
}
