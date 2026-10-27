#!/usr/bin/env node
"use strict";

// Activity feed CLI reader — prints the cross-project activity log as JSON.
//
// CLI-only (D3/D14): this is NOT an MCP tool and must never be exposed as one.
// The console spawns it to render a live activity feed. Lenient by design
// (D12): malformed lines are skipped, a missing log yields [] and exit 0.

const fs = require("fs");
const path = require("path");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
// Lines carry 5 (legacy) or 6 (current) fields: timestamp, project, sender,
// recipient, subject, and the optional sender_project. Any other count is
// foreign data and is skipped (D12).
const MIN_FIELD_COUNT = 5;
const MAX_FIELD_COUNT = 6;

// Mirrors core `domain/constants.ts` (readEnvPath): COMMON_PATH env wins,
// otherwise the same fallback. Kept inline so the CLI stays standalone
// (no runtime dependency on the @m_ai_l/core build).
function resolveCommonRoot() {
  const value = process.env.COMMON_PATH && process.env.COMMON_PATH.trim();
  return value && value.length > 0 ? value : "C:\\dev\\common";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let since = null;
  let limit = DEFAULT_LIMIT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--since" && args[i + 1] !== undefined) {
      since = args[++i];
    } else if (args[i] === "--limit" && args[i + 1] !== undefined) {
      const parsed = Number.parseInt(args[++i], 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error(`Invalid --limit value: ${args[i]}`);
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  if (since !== null && Number.isNaN(new Date(since).getTime())) {
    throw new Error(`Invalid --since value: ${since}`);
  }

  return { since, limit };
}

// Legacy 5-field lines carry no sender_project. Derive it deterministically:
// cross-project senders are qualified as "PROJECT/HANDLE", so the prefix is the
// origin project; a bare handle is an intra-project send (sender project ==
// recipient project, i.e. the `project` field).
function deriveSenderProject(sender, project) {
  const idx = sender.indexOf("/");
  return idx > 0 ? sender.substring(0, idx) : project;
}

function readActivityFeed({ since, limit }) {
  const logPath = path.join(resolveCommonRoot(), "activity.log");
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const sinceTime = since === null ? null : new Date(since).getTime();
  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const entries = [];

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < MIN_FIELD_COUNT || parts.length > MAX_FIELD_COUNT) {
      continue; // D12: malformed field count — skip
    }

    const [timestamp, project, sender, recipient, subject, senderProject] = parts;
    const entryTime = new Date(timestamp).getTime();
    if (Number.isNaN(entryTime)) {
      continue; // D12: unparseable timestamp — skip
    }

    if (sinceTime !== null && entryTime < sinceTime) {
      continue;
    }

    entries.push({
      timestamp,
      project,
      sender,
      recipient,
      subject,
      // A missing OR empty 6th field falls back to the derived origin (robust
      // to truncated or hand-edited lines).
      sender_project: senderProject ? senderProject : deriveSenderProject(sender, project),
    });
  }

  // D13: newest-first. The writer appends chronologically, so reverse() gives
  // descending order without a re-sort.
  entries.reverse();
  return entries.slice(0, limit);
}

function main() {
  const { since, limit } = parseArgs(process.argv);
  const feed = readActivityFeed({ since, limit });
  process.stdout.write(`${JSON.stringify(feed, null, 2)}\n`);
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error(`[activity-feed] Error: ${error.message}`);
  process.exit(1);
}
