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
pnpm -r test      # 361 tests / 46 suites
```

Consumers:

- As an npm package: `@m_ai_l/core` (library) and `@m_ai_l/mcp` (server with
  bundled `dist/server.bundle.js` and a `m-ai-l-mcp` bin).
- As an OpenCode plugin: `tools/mailbox.ts` loads `@m_ai_l/core` via
  `MAILBOX_LIBRARY_PATH` (defaults to `packages/core/dist/index.js`).

## Quickstart

Configure the project registry path, then point an MCP client at the server:

```bash
# Defaults: C:\dev\common (COMMON_PATH), C:\dev\m_AI_l_EXPORT (PROJECT_ROOT)
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

13 tools registered on stdio:

| Tool | Input (required, optional...) |
|---|---|
| `read_mail` | `project_handle`, `handle`, `limit?`, `no_archive?` |
| `write_mail` | `project_handle`, `sender`, `recipient`, `priority`, `subject`, `body`, `sender_project_handle?` |
| `edit_mail` | `project_handle`, `sender`, `recipient`, `timestamp`, `subject`, `new_priority?`, `new_subject?`, `new_body?` |
| `cancel_mail` | `project_handle`, `sender`, `recipient`, `timestamp`, `subject` |
| `archive_mail` | `project_handle`, `handle` |
| `read_recent_archive` | `handle`, `limit?`, `current_project_handle?`, `cwd?` |
| `get_projects` | none |
| `get_roster` | `project_handle` |
| `get_member_context` | `project_handle`, `handle` |
| `resolve_handle_candidates` | `target_handle`, `current_project_handle?`, `cwd?` |
| `init_mail` | `project_handle`, `handle`, `role`, `mailbox?`, `status?` |
| `handover_self` | `project_handle`, `handle`, `body`, `sender?` |
| `get_outbox` | `project_handle`, `handle` |

`write_mail` with `sender_project_handle` different from `project_handle` signs
the sender as `ORIGIN/HANDLE` for cross-project delivery. Cancel and edit only
match unread messages in the recipient's active mailbox; multiple matches are a
conflict error.

## Skills

`skills/messaging/` ships instruction files (`mailbox_read.md`,
`mailbox_write.md`) for harnesses without MCP support, with a filesystem
fallback.
When MCP is available, prefer the tools — the skills cost more tokens per
message. See `skills/README.md`.

## License

Apache-2.0
