---
name: mailbox-write
description: Compose, send, cancel, or correct project mailbox messages. Use when the user sends SEND!, SEND?, or asks Codex to notify another thread, deliver a decision, request information, cancel an unread message, or correct a previously sent message. Prefer the messaging MCP server when available; otherwise fall back transparently to direct filesystem mailbox files.
---

# mailbox-write

Use these stable behaviours:
- support the triggers `SEND?`, `SEND!`, and `SEND! HANDLE`
- use the standard message format `HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body`
- preserve the `<!-- END -->` end-of-file marker when using the filesystem backend
- correct an unread message in place when possible; otherwise send a correction message instead

Prefer the messaging MCP server when its tools are available. Fall back to direct filesystem operations only when MCP messaging is unavailable.

## Triggers

- `SEND?`
  Reflect on what should be communicated, propose a message, and wait for validation before sending.
- `SEND!`
  Reflect on what should be communicated and send immediately.
- `SEND! HANDLE`
  Send immediately to the specified handle only.

## Backend Selection

### Preferred backend: MCP

Use the messaging MCP tools when available.

Mapping:
- inspect recipient candidates explicitly when the user wants clarification before sending
  `resolve_handle_candidates(target_handle, current_project_handle?, cwd?)`
- strict delivery when the target project is known
  `write_mail(project_handle, sender, recipient, priority, subject, body)`
- cancel unread message
  `cancel_mail(project_handle, sender, recipient, timestamp, subject)`
- correct unread message in place, or send correction if already read
  `edit_mail(project_handle, sender, recipient, timestamp, subject, new_priority?, new_subject?, new_body?)`
- inspect sent history if needed
  `get_outbox(project_handle, handle)`
- confirm recipient metadata if needed
  `get_roster(project_handle)`

When using MCP:
- trust the server for roster resolution, HUMAN routing, locks, and atomic writes
- do not reimplement mailbox safety in the skill
- when the user provides only a handle and not a project context, resolve the project first, then call `write_mail`

### Fallback backend: filesystem

If MCP messaging is not available:
- read the active project's `roster.md` to confirm the recipient handle and the mailbox path declared for that recipient
- do not assume the mailbox lives in the current project; use the declared mailbox path even when it points to a transverse or cross-project location
- write to the declared mailbox file using the sentinel pattern
- log a minimal line to `./outbox_[YOUR_HANDLE].md`
- replace any literal `<!-- END -->` inside the subject or body with `(((END)))`

Fallback correction rules:
- if the target message is still present in the active mailbox, replace it directly
- if it is no longer present, send a new message prefixed with `CORRECTION:`

## Standard Procedure

1. Decide whether something should be communicated.
2. Resolve the active project, sender handle, and recipient handle.
3. Prefer MCP delivery.
4. Compose one message in the standard format.
5. Send or propose depending on the trigger.
6. Keep the outbox reference minimal.

## Cancellation And Correction

Use this working key to identify a previously sent message:
- `sender`
- `timestamp`
- `recipient`
- `subject`

Assume that multiple active matches are an error and stop rather than guessing.

Cancellation:
- use only when the message should disappear entirely and is expected to be unread

Correction:
- use when the intent remains valid but the content must change
- if the message was already read, send a correction message instead of trying to rewrite history
- use the prefix `CORRECTION:` in the follow-up subject when a new correction message must be sent

## HUMAN Rule

If HUMAN is directly available in chat, prefer answering in chat.
Use mailbox delivery to HUMAN only when asynchronous communication is actually needed.

## Rules

- Always verify the intended recipient rather than guessing.
- Keep subjects short and actionable.
- Keep outbox logging minimal.
- Never write literal `<!-- END -->` in message content; use `(((END)))`.
- Never modify unrelated messages.
- Prefer `SEND?` when the communication value is uncertain.
- If several active messages match the same working key, stop and treat it as an ambiguity rather than guessing.

## Message Format

```text
HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Message body
```

Outbox format:

```text
YYYYMMDD-HHMM // RECIPIENT_HANDLE // SUBJECT
```
