import { COMMON_ROOT, PROJECTS_FILE } from "../domain/constants";
import path from "path";

export function getMailboxPath(projectPath: string, handle: string): string {
  return path.join(projectPath, `mailbox_${handle}.md`);
}

export function getArchivePath(projectPath: string, handle: string): string {
  return path.join(projectPath, `mailbox_${handle}_archive.md`);
}

export function getOutboxPath(projectPath: string, handle: string): string {
  return path.join(projectPath, `outbox_${handle}.md`);
}

export function getRosterPath(projectPath: string, rosterPath?: string): string {
  return rosterPath ?? path.join(projectPath, "roster.md");
}

export function getProjectsPath(): string {
  return path.join(COMMON_ROOT, PROJECTS_FILE);
}
