# m_AI_l

Asynchronous inter-agent messaging for AI coding agents. A pnpm monorepo with a
TypeScript core (`@m_ai_l/core`) and an MCP server (`@m_ai_l/mcp`) that lets any
MCP-capable harness read, send, cancel, and edit project mailbox messages.

## Why

Agents working in parallel need a durable, conflict-safe channel to exchange
briefs, decisions, and handover notes. m_AI_l stores messages as plain Markdown
mailboxes — inspectable with any editor — and exposes the operations through
MCP tools so agents never parse files manually.

Key properties:

- File-based mailboxes (`mailbox_HANDLE.md`) with atomic writes and light locking
- Roster-driven routing: a project's `roster.md` is the authority for messaging paths
- Canonical project registry: `[COMMON_PATH]/projects_config.md`
- Read archives by default; `no_archive` or `limit` to opt out / read less
- `read_recent_archive` recovers messages when a client crashed after server-side archiving

## Installation

Requirements: Node.js >= 18, pnpm >= 9.

```bash
pnpm install
pnpm -r build     # compiles packages/core and packages/mcp
pnpm -r test      # 401 tests
```

Consumers:

- As an npm package: `@m_ai_l/core` (library) and `@m_ai_l/mcp` (bundled server
  bin `m-ai-l-mcp` + activity feed CLI bin `m-ai-l-activity-feed`).
- As a Claude Code / ZCode plugin: `m-ai-l-mailbox` (see `plugin/`), distributed
  via the GitHub marketplace (`.claude-plugin/marketplace.json` at repo root).
- As an OpenCode plugin: `tools/mailbox.ts` loads `@m_ai_l/core` via
  `MAILBOX_LIBRARY_PATH` (defaults to `packages/core/dist/index.js`).

## Quickstart

### From npm (consumers)

Add the server to your MCP client configuration:

```json
{
  "mcpServers": {
    "m-ai-l": {
      "command": "npx",
      "args": ["-y", "-p", "@m_ai_l/mcp", "m-ai-l-mcp"],
      "env": { "COMMON_PATH": "C:/dev/common" }
    }
  }
}
```

Use the `-p <package> <bin>` form — the package ships two bins, so bare
`npx @m_ai_l/mcp` is ambiguous. Prereleases live under the `next` dist-tag
(`-p @m_ai_l/mcp@next`). Then run the ARO skill (`skills/messaging/aro.md`)
for guided setup, or call `get_projects` / `init_mail` / `write_mail` directly.

### From source (contributors)

Configure the project registry path, then point an MCP client at the server:

```bash
# COMMON_PATH: env var, else ~/.m_ai_l/config.json (commonPath), else actionable error
set COMMON_PATH=C:\dev\common
node packages/mcp/dist/server.js
```

Client configuration (local MCP server, stdio):

```json
{
  "mcp": {
    "m_AI_l_MCP": {
      "type": "local",
      "command": ["node", "<repo>/Vibe/mcp_server/packages/mcp/dist/server.js"],
      "environment": { "COMMON_PATH": "C:/dev/common" }
    }
  }
}
```

Read the inbox of a handle in a project:

```
mailbox({ action: "mail", project_handle: "MAILEXPORT", handle: "AGENT1" })
```

## Configuration

`COMMON_PATH` (and `PROJECT_ROOT`) are resolved lazily on every call:

1. Environment variable (`COMMON_PATH` / `PROJECT_ROOT`)
2. Home config `~/.m_ai_l/config.json` — `{ "commonPath": "...", "projectRoot": "..." }` (Windows: `%USERPROFILE%\.m_ai_l\config.json`)
3. Actionable error: "COMMON_PATH is not configured. Set the COMMON_PATH environment variable in your MCP client config, or run the ARO skill once to register your common folder."

No hardcoded fallback. Resolution is not memoized: a home config written
mid-session (e.g. by ARO) is picked up without a restart. A present-but-corrupt
home config raises `ConfigCorruptionError` — never silently ignored. The
activity feed CLI resolves `COMMON_PATH` with the same chain (exit 1 + stderr
on missing or corrupt config).

## Concepts

| Concept | Rule |
|---|---|
| Message format | `HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body` |
| Priority | `H`, `M`, or `L` |
| Sentinel | `<!-- END -->` marks the mailbox boundary; rewritten to `(((END)))` inside content |
| Source of truth | `[COMMON_PATH]/projects_config.md` lists projects, paths, rosters |
| Roster | `<project>/roster.md` maps handles to mailbox/outbox files; `inactive` entries reject sends |
| HUMAN | Global mailbox resolved next to `projects_config.md` under `COMMON_PATH` |
| Cross-project mailboxes | Roster entries may declare absolute paths in other projects |
| Locking | `X.lock` beside the target file; locks older than 10 minutes expire |
| Atomic writes | Temp file in `tmp/`, then rename — crash leaves old or new complete state |
| Outbox | Best-effort: delivery to the recipient inbox wins; a failed outbox trace never cancels a send |
| Tolerant reads | Imperfect timestamp or missing priority does not block reading; multi-line bodies stay one message |

## API Core (`@m_ai_l/core`)

Main exports from `dist/index.js`:

| Function | Purpose |
|---|---|
| `readMail(project, handle, opts?)` | Read (and by default archive) inbox messages; `limit`, `noArchive` options |
| `writeMail(project, sender, recipient, priority, subject, body, opts?)` | Deliver a message + outbox trace |
| `editMail(project, sender, recipient, timestamp, subject, patch?)` | Edit unread in place, else send `CORRECTION:` message |
| `cancelMail(project, sender, recipient, timestamp, subject)` | Remove an unread message |
| `archiveMail(project, handle)` | Archive a mailbox and reset to sentinel |
| `initMail(project, handle, role, mailbox?, status?)` | Create messaging files + roster entry |
| `getProjects` / `getRoster` / `getOutbox` | Registry, roster, outbox readers |
| `getMemberContext(project, handle)` | Resolved paths + member context |
| `resolveHandleCandidates(target, current?, cwd?)` | current project -> COMMON -> all active projects |
| `readRecentArchive(handle, limit?, current?, cwd?)` | Recovery after crash-interrupted reads |
| `handoverSelf(project, handle, body, sender?)` | Standardized self-handover note |
| `mailboxWithLib(lib, input)` | Inbox entry used by the OpenCode plugin |

Business errors: `ProjectNotFoundError`, `RosterEntryNotFoundError`,
`RosterEntryInactiveError`, `RosterEntryExistsError`, `MailboxNotFoundError`,
`FileOperationError`, `InvalidMessageFormatError`.

## API MCP (`@m_ai_l/mcp`)

The MCP server registers 13 tools. All are technically callable by any MCP client.
However, we recommend harnesses restrict autonomous agent access to the **5 message
lifecycle tools** (`read_mail`, `write_mail`, `edit_mail`, `cancel_mail`, `archive_mail`).
The remaining 8 tools (`get_projects`, `get_roster`, `resolve_handle_candidates`,
`get_member_context`, `init_mail`, `handover_self`, `read_recent_archive`, `get_outbox`)
are intended for CLI or administrative setup, not for autonomous agent use.

| Tool | Input (required, optional...) | Purpose note |
|---|---|---|
| `read_mail` | `project_handle`, `handle`, `limit?`, `no_archive?` | Read (and archive) inbox messages |
| `write_mail` | `project_handle`, `sender`, `recipient`, `priority`, `subject`, `body`, `sender_project_handle?` | Deliver a message + outbox trace |
| `edit_mail` | `project_handle`, `sender`, `recipient`, `timestamp`, `subject`, `new_priority?`, `new_subject?`, `new_body?` | Edit unread in place, else send `CORRECTION:` |
| `cancel_mail` | `project_handle`, `sender`, `recipient`, `timestamp`, `subject` | Remove an unread message |
| `archive_mail` | `project_handle`, `handle` | **Maintenance**: archives the entire mailbox and resets to sentinel (not a per-message action) |
| `read_recent_archive` | `handle`, `limit?`, `current_project_handle?`, `cwd?` | Recovery after crash-interrupted reads |
| `get_projects` | none | List all active projects |
| `get_roster` | `project_handle` | List handles of a project |
| `get_member_context` | `project_handle`, `handle` | Resolved paths + member context |
| `resolve_handle_candidates` | `target_handle`, `current_project_handle?`, `cwd?` | current project -> COMMON -> all active projects |
| `init_mail` | `project_handle`, `handle`, `role`, `mailbox?`, `status?` | Create messaging files + roster entry |
| `handover_self` | `project_handle`, `handle`, `body`, `sender?` | Standardized self-handover note |
| `get_outbox` | `project_handle`, `handle` | Read outbox (read-only, write path is frozen) |

`write_mail` with `sender_project_handle` different from `project_handle` signs
the sender as `ORIGIN/HANDLE` for cross-project delivery. Cancel and edit only
match unread messages in the recipient's active mailbox; multiple matches are a
conflict error.

## Skills

`skills/messaging/` ships instruction files (`mailbox_read.md`,
`mailbox_write.md`, `aro.md` — guided onboarding) for harnesses without MCP
support, with a filesystem fallback.
When MCP is available, prefer the tools — the skills cost more tokens per
message. See `skills/README.md`.

## Activity feed

Every send is appended to `[COMMON_PATH]/activity.log` (best-effort, 30-day
retention via prune). Read it as JSON with the CLI bin — intentionally not an
MCP tool:

```bash
npx -y -p @m_ai_l/mcp m-ai-l-activity-feed --since 2026-11-01 --limit 20
```

Newest first; missing log yields `[]` (exit 0); malformed lines are skipped.

## License

Apache-2.0
