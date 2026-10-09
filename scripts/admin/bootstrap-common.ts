#!/usr/bin/env node
import { bootstrapCommonMessaging } from "../../packages/core/src/admin";

import { getCommonRoot } from "../../packages/core/src/admin/util";
interface CliArgs {
  language?: string;
  ensureCommonEntry?: boolean;
  dryRun?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--language" && i + 1 < argv.length) {
      args.language = argv[++i];
    } else if (arg === "--no-ensure-common-entry") {
      args.ensureCommonEntry = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function main() {
  const args = parseArgs();
  const COMMON_ROOT = getCommonRoot();

  console.error(`[admin_bootstrap_common_messaging] COMMON_PATH=${COMMON_ROOT}`);

  const result = bootstrapCommonMessaging({
    language: args.language,
    ensure_common_entry: args.ensureCommonEntry,
    dry_run: args.dryRun,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.status === "error") {
    process.exit(1);
  }
}

main();
