import { getOutboxFromPath } from "../repositories/outbox-repo";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { OutboxEntry } from "../domain/types";
import { resolveMemberOutboxPath } from "./mail-routing";

export function getOutboxService(projectHandle: string, handle: string): OutboxEntry[] {
  const project = getProject(projectHandle);
  const roster = getRoster(project.path, project.roster);
  const outboxPath = resolveMemberOutboxPath(project.path, roster, handle);
  return getOutboxFromPath(outboxPath);
}
