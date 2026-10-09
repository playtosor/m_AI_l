#!/usr/bin/env node
import { validateMessagingBootstrap } from "../../packages/core/src/admin";

import { getCommonRoot } from "../../packages/core/src/admin/util";
interface CliArgs {
  projectHandle?: string;
  dryRun?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project-handle" && i + 1 < argv.length) {
      args.projectHandle = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function main() {
  const args = parseArgs();
  const COMMON_ROOT = getCommonRoot();

  console.error(`[admin_validate_messaging_bootstrap] COMMON_PATH=${COMMON_ROOT}`);

  const result = validateMessagingBootstrap({
    project_handle: args.projectHandle,
    dry_run: args.dryRun,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.status === "error") {
    process.exit(1);
  }
}

main();
