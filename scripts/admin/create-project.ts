#!/usr/bin/env node
import { createMessagingProject } from "../../packages/core/src/admin";

import { getCommonRoot } from "../../packages/core/src/admin/util";
interface CliArgs {
  projectHandle?: string;
  projectPath?: string;
  status?: string;
  projectPathMode?: "strict" | "create";
  dryRun?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project-handle" && i + 1 < argv.length) {
      args.projectHandle = argv[++i];
    } else if (arg === "--project-path" && i + 1 < argv.length) {
      args.projectPath = argv[++i];
    } else if (arg === "--status" && i + 1 < argv.length) {
      args.status = argv[++i];
    } else if (arg === "--project-path-mode" && i + 1 < argv.length) {
      const mode = argv[++i];
      if (mode === "strict" || mode === "create") {
        args.projectPathMode = mode;
      }
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function main() {
  const args = parseArgs();
  const COMMON_ROOT = getCommonRoot();

  if (!args.projectHandle) {
    console.error("Error: --project-handle is required");
    process.exit(1);
  }

  if (!args.projectPath) {
    console.error("Error: --project-path is required");
    process.exit(1);
  }

  console.error(`[admin_create_messaging_project] COMMON_PATH=${COMMON_ROOT}`);

  const result = createMessagingProject({
    project_handle: args.projectHandle,
    project_path: args.projectPath,
    status: args.status,
    project_path_mode: args.projectPathMode,
    dry_run: args.dryRun,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.status === "error") {
    process.exit(1);
  }
}

main();
