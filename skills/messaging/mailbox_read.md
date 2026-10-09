---
name: mailbox-read
description: Read, acknowledge, and archive project mailbox messages. Use when a session starts with mailbox onboarding, when the user sends MAIL! or MSG?, or when Codex needs to inspect inbox state. Prefer the messaging MCP server when available; otherwise fall back transparently to direct filesystem mailbox files.
---

# mailbox-read

Use these stable behaviours:
- support the triggers `MAIL!` and `MSG?`
- use the standard message format `HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body`
- archive by default after successful reading
- acknowledge messages briefly and naturally

Prefer the messaging MCP server when its tools are available. Fall back to direct filesystem operations only when MCP messaging is unavailable.

## Triggers

- `MAIL!`
  Read incoming mail immediately, acknowledge briefly, and archive by default.
- `MSG?`
  HUMAN only. Tell the user how many pending messages exist, if any, without archiving or surfacing message content.

If `MAIL!` appears alongside other requests, process the mailbox first.

## Backend Selection

### Preferred backend: MCP

Use the messaging MCP tools when available.

Mapping:
- `MAIL!`
  Use `read_mail(project_handle, handle)` by default.
- `MSG?`
  Use `read_mail(project_handle, "HUMAN", no_archive=true)` only to obtain the pending count, then report that count to the user without surfacing message content.
- recovery after a crash or interrupted post-read flow
  Use `read_recent_archive(handle, limit?, current_project_handle?, cwd?)` to inspect the last archived messages without modifying state.

When using MCP:
- trust the server for roster resolution, locking, sentinel safety, and archiving behaviour
- acknowledge messages in chat after reading them
- do not restate the full mailbox unless the user asks
- if a client crashed just after `read_mail`, prefer `read_recent_archive(..., limit=1)` instead of forcing another normal read

### Fallback backend: filesystem

If MCP messaging is not available:
- read `./mailbox_[YOUR_HANDLE].md`
- parse each message line as `HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body`
- acknowledge each readable message naturally in one short sentence
- if there is no ambiguity, append all read content to `./mailbox_[YOUR_HANDLE]_archive.md`
- reset the mailbox to sentinel-only: `<!-- END -->`

For `MSG?` in fallback mode:
- inspect `mailbox_HUMAN.md`
- count pending message lines before the sentinel
- report only the count to the user
- do not archive

## Procedure

1. Resolve the active project and your handle from the current session context.
2. Read the mailbox through MCP if possible; otherwise use the filesystem.
3. Interpret each message.
4. Acknowledge naturally in one short sentence per message.
5. If a message is ambiguous, ask before archiving.
6. Archive silently unless an error occurs.

Recovery note:
- if the previous attempt likely crashed after server-side archiving, use `read_recent_archive` to recover the most recent archived message before resuming the normal loop

## Rules

- Keep acknowledgements short and natural.
- Archive silently unless something failed or a message is unclear.
- Never delete the mailbox file.
- Preserve the sentinel `<!-- END -->` in filesystem mode.
- Treat `SELF` messages like any other message. `SELF` means that an agent using the same HANDLE sent a message to its own future session, typically as a handover note.
- `read_mail` reads all messages by default; use `limit` to read only the oldest N messages.
- Do not use `read_recent_archive` as a replacement for normal inbox reading; reserve it for recovery and debugging.

## Message Format

```text
HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Message body
```

Fields:
- `HANDLE`
  Sender identifier.
- `YYYYMMDD-HHMM`
  Timestamp and practical message key.
- `PRIORITY`
  `H`, `M`, or `L`.
- `SUBJECT`
  Short topic line.
- `Body`
  Free text content.
