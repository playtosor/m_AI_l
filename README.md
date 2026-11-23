# m_AI_l

**Cross-harness email for AI agents.**

Get Claude to talk to Codex and OpenCode. m_AI_l is asynchronous messaging for
AI agents: two agents working in different tools, on different machines, at
different times can leave each other messages the way people use email:
briefs, decisions, questions, handover notes. No shared session, no shared
context window, no shared harness required.

## What it is for

Modern projects rarely use one AI tool. One agent runs in Claude, another in
OpenCode, a third in a terminal CLI, a fourth in a web chat. Each harness has
its own memory, its own format, its own silo. m_AI_l gives them one thing they
all share: the filesystem, and a tiny protocol on top of it.

The philosophy is **role-based**:

- Every mailbox belongs to a **role**, not to a tool. `architect`, `coder`,
  `reviewer`, `tester` are addresses. Who sits behind the address, and in which
  harness, can change at any time.
- Every **project is a team**. A project defines its roster of roles, and team
  members exchange messages within it.
- A role can be handed over mid-project. That is a feature, not an accident:
  m_AI_l was itself built this way. The architect started under Claude, was
  handed over to Codex, then to Qwen Chat. The coders and reviewers ran on
  OpenCode and the Mistral Vibe CLI. The team never changed, only the harnesses
  did.

The mailboxes are **plain Markdown files**. Any human can open one in an editor,
read the conversation, fix a typo, or delete a stale note. No database, no
server, no binary format. Everything is transparent and editable by design.

## How it works, in one minute

1. Each project has a `roster.md` listing its roles and their mailbox files.
2. A shared registry (`projects_config.md`) maps projects to their folders.
3. `write_mail` delivers a message to a role's inbox; `read_mail` reads (and by
   default archives) it.
4. Messages are short Markdown lines: `HANDLE // date-time // priority // subject // body`.
5. Writes are atomic and lightly locked, so several agents can work in parallel
   without corrupting each other's mail.

## Installation

Requirements: Node.js >= 18, pnpm >= 9.

```bash
pnpm install
pnpm -r build     # compiles packages/core and packages/mcp
pnpm -r test
```

You can use m_AI_l in several ways:

- **npm packages**: `@m_ai_l/core` (library) and `@m_ai_l/mcp` (MCP server bin
  `m-ai-l-mcp` + activity feed CLI bin `m-ai-l-activity-feed`).
- **Claude Code / ZCode plugin**: `m-ai-l-mailbox` (see `plugin/`), distributed
  via the GitHub marketplace.
- **OpenCode plugin**: `tools/mailbox.ts` loads `@m_ai_l/core` via
  `MAILBOX_LIBRARY_PATH` (defaults to `packages/core/dist/index.js`).

### Quickstart from npm

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

Use the `-p <package> <bin>` form, as the package ships two bins, so bare
`npx @m_ai_l/mcp` is ambiguous. Prereleases live under the `next` dist-tag. Then
run the ARO skill (`skills/messaging/aro.md`) for guided setup, or call
`get_projects` / `init_mail` / `write_mail` directly.

### From source

```bash
set COMMON_PATH=C:\dev\common
node packages/mcp/dist/server.js
```

Read the inbox of a role in a project:

```
mailbox({ action: "mail", project_handle: "MAILEXPORT", handle: "AGENT1" })
```

## Configuration

`COMMON_PATH` (and `PROJECT_ROOT`) are resolved lazily on every call:

1. Environment variable (`COMMON_PATH` / `PROJECT_ROOT`)
2. Home config `~/.m_ai_l/config.json` with `{ "commonPath": "...", "projectRoot": "..." }`
3. Actionable error telling you exactly how to fix it

No hardcoded fallback, and resolution is not memoized: a home config written
mid-session (e.g. by ARO) is picked up without a restart. A corrupt config
raises `ConfigCorruptionError` instead of being silently ignored.

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
| Atomic writes | Temp file in `tmp/`, then rename, so a crash leaves the old or new complete state |
| Outbox | Best-effort: delivery to the recipient inbox wins; a failed outbox trace never cancels a send |
| Tolerant reads | An imperfect timestamp or a missing priority does not block reading; multi-line bodies stay one message |

## API: core (`@m_ai_l/core`)

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

## API: MCP (`@m_ai_l/mcp`)

The MCP server registers 13 tools. We recommend harnesses restrict autonomous
agent access to the **5 message lifecycle tools** (`read_mail`, `write_mail`,
`edit_mail`, `cancel_mail`, `archive_mail`). The remaining 8 are intended for
CLI or administrative setup.

| Tool | Input | Purpose |
|---|---|---|
| `read_mail` | `project_handle`, `handle`, `limit?`, `no_archive?` | Read (and archive) inbox messages |
| `write_mail` | `project_handle`, `sender`, `recipient`, `priority`, `subject`, `body`, `sender_project_handle?` | Deliver a message + outbox trace |
| `edit_mail` | `project_handle`, `sender`, `recipient`, `timestamp`, `subject`, `new_priority?`, `new_subject?`, `new_body?` | Edit unread in place, else send `CORRECTION:` |
| `cancel_mail` | `project_handle`, `sender`, `recipient`, `timestamp`, `subject` | Remove an unread message |
| `archive_mail` | `project_handle`, `handle` | Archive the entire mailbox and reset to sentinel |
| `read_recent_archive` | `handle`, `limit?`, `current_project_handle?`, `cwd?` | Recovery after crash-interrupted reads |
| `get_projects` | none | List all active projects |
| `get_roster` | `project_handle` | List handles of a project |
| `get_member_context` | `project_handle`, `handle` | Resolved paths + member context |
| `resolve_handle_candidates` | `target_handle`, `current_project_handle?`, `cwd?` | current project -> COMMON -> all active projects |
| `init_mail` | `project_handle`, `handle`, `role`, `mailbox?`, `status?` | Create messaging files + roster entry |
| `handover_self` | `project_handle`, `handle`, `body`, `sender?` | Standardized self-handover note |
| `get_outbox` | `project_handle`, `handle` | Read outbox (read-only) |

`write_mail` with `sender_project_handle` different from `project_handle` signs
the sender as `ORIGIN/HANDLE` for cross-project delivery.

## Skills

`skills/messaging/` ships instruction files (`mailbox_read.md`,
`mailbox_write.md`, `aro.md` for guided onboarding) for harnesses without MCP
support, with a filesystem fallback. When MCP is available, prefer the tools:
the skills cost more tokens per message. See `skills/README.md`.

## Activity feed

Every send is appended to `[COMMON_PATH]/activity.log` (best-effort, 30-day
retention). Read it as JSON with the CLI bin, intentionally not an MCP tool:

```bash
npx -y -p @m_ai_l/mcp m-ai-l-activity-feed --since 2026-11-01 --limit 20
```

Newest first; a missing log yields `[]` (exit 0); malformed lines are skipped.

## License

Apache-2.0
