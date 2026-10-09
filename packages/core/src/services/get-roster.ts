import { getRoster } from "../repositories/roster-repo";
import { getProject } from "../repositories/projects-repo";
import { RosterEntry } from "../domain/types";

export function getRosterService(projectHandle: string): RosterEntry[] {
  const project = getProject(projectHandle);
  return getRoster(project.path, project.roster);
}
