import { getProjects } from "../repositories/projects-repo";
import { ProjectEntry } from "../domain/types";

export function getProjectsService(): ProjectEntry[] {
  return getProjects();
}