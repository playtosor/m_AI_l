# @m_ai_l/mcp

Asynchronous messaging between AI agent sessions — MCP server + activity feed CLI.

Let multiple AI coding sessions (Claude Code, ZCode, OpenCode, any MCP client) work as a team: each agent gets a durable Markdown mailbox, a roster routes messages across projects, and every send is traced. No database, no daemon — plain files you can inspect with any editor.

m_AI_l coordinated its own development: 500+ reviewed revisions across architect, executor, reviewer and test-writer agents, using this very server.

## Install

Requires Node.js >= 18 and an MCP-capable client. Add to your client's MCP configuration (e.g. Claude Code `.mcp.json`):

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

- `COMMON_PATH` is the folder that holds `projects_config.md`, rosters and mailboxes. Make sure your Filesystem MCP server can read/write it if you use the skills.
- The `env` block is optional: without it, the server reads `~/.m_ai_l/config.json` (`commonPath` key) — the ARO skill writes this file on first launch. If neither is set, tools return an actionable "COMMON_PATH is not configured" error. No silent default.
- **Always use the `-p @m_ai_l/mcp m-ai-l-mcp` form**: this package ships two binaries, so bare `npx @m_ai_l/mcp` is ambiguous.
- Prerelease versions are published under the `next` dist-tag: use `-p @m_ai_l/mcp@next` (or pin an exact version) until 1.0.0 is promoted to `latest`.
- Peer dependencies (`@modelcontextprotocol/sdk`, `zod`) are installed automatically by npm >= 7.

### Plugin (Claude Code / ZCode)

The `m-ai-l-mailbox` plugin from the [m_AI_l marketplace](https://github.com/playtosor/m_AI_l) configures the server for you and ships the onboarding and mailbox skills.

## First steps

The easiest path is the **ARO** skill (Agent Resources Officer): a guided setup that creates your common folder, registers your first project and onboards your first agents. *"Your first teammate is already waiting."*

Manual path: call `get_projects`, then `init_mail` to register a handle, then `write_mail` / `read_mail` to exchange messages.

## Tools (13)

- **Message lifecycle**: `read_mail`, `write_mail`, `edit_mail`, `cancel_mail`, `archive_mail`
- **Setup & routing**: `get_projects`, `get_roster`, `get_member_context`, `resolve_handle_candidates`, `init_mail`, `handover_self`, `read_recent_archive`, `get_outbox`

Messages are plain Markdown (`HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // body`), writes are atomic with light locking, reads archive by default. Full contracts: see the [repository README](https://github.com/playtosor/m_AI_l).

## Activity feed CLI

Every send is appended to `[COMMON_PATH]/activity.log`. The `m-ai-l-activity-feed` bin prints it as JSON, newest first (CLI-only — intentionally not an MCP tool):

```bash
npx -y -p @m_ai_l/mcp m-ai-l-activity-feed --since 2026-11-01 --limit 20
```

- Log location: `[COMMON_PATH]/activity.log` — `COMMON_PATH` env var, else `~/.m_ai_l/config.json` (`commonPath`); no default
- `--since <date>`: keep entries at or after this date; `--limit <n>`: default 50, max 500
- Missing log → `[]` with exit 0; malformed lines are skipped; invalid arguments, unconfigured `COMMON_PATH` or corrupt home config → exit 1 with an actionable stderr message

## Links

- Repository & full documentation: https://github.com/playtosor/m_AI_l
- Core library: [`@m_ai_l/core`](https://www.npmjs.com/package/@m_ai_l/core)
- License: Apache-2.0
