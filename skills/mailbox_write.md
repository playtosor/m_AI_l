---
name: mailbox-write
description: Compose and deliver a message to another thread's mailbox, and log it in your outbox. Also handles message cancellation.
---

# mailbox_write — Send a message to a team member

## Objective
Deposit a message in a recipient's mailbox and keep a reference in your outbox. Supports correction of unsent messages via direct edit.

---

## When to use
- When you produce something that impacts another thread
- When you need to communicate a decision, a change, or a request
- When you need to correct a message not yet read by the recipient
- When the user sends one of the following triggers:

| Trigger | Behaviour |
|---|---|
| `SEND?` | Reflect on what's worth communicating (e.g. decisions taken, changes impacting others, requests for info) — propose a message or confirm nothing to send, wait for user validation before writing |
| `SEND!` | Same reflection (e.g. decisions taken, changes impacting others, requests for info), but write and deposit immediately without waiting for validation |
| `SEND! HANDLE` | Write and deposit immediately to the specified HANDLE only |

---

## Files involved

| File | Role |
|------|------|
| `./mailbox_[RECIPIENT_HANDLE].md` | Recipient's inbox — you append to it |
| `./outbox_[YOUR_HANDLE].md` | Your sent log — you trace each message here |

---

## Procedure — Standard message

### 1. Check the roster
Read `./roster.md` to confirm the recipient's exact handle and mailbox filename.

### 2. Compose the message
```
HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Message body
```

| Field | Values | Description |
|-------|--------|-------------|
| HANDLE | your identifier | e.g. ARCHI, HUMAN, GPT_AGENT |
| YYYYMMDD-HHMM | timestamp | Send date and time — also serves as message ID |
| PRIORITY | H / M / L | High / Medium / Low |
| SUBJECT | short free text | Theme or title |
| Body | free text | Message content |

### 3. Deposit in recipient's mailbox
**Before depositing:** verify that `<!-- END -->` is present in `./mailbox_[RECIPIENT_HANDLE].md` using `tail:1`. If absent, add it with `write_file` before continuing.

Use `edit_file` to insert the message into `./mailbox_[RECIPIENT_HANDLE].md`:
- `oldText`: `<!-- END -->`
- `newText`: `[your message]\n<!-- END -->`

The sentinel line `<!-- END -->` is always present at the end of every mailbox (added by `mailbox_init`). This ensures the insertion is always safe, atomic, and never overwrites existing content.

### 4. Log in your outbox
**Before logging:** verify that `<!-- END -->` is present in `./outbox_[YOUR_HANDLE].md` using `tail:1`. If absent, add it with `write_file` before continuing.

Use `edit_file` to append one line to `./outbox_[YOUR_HANDLE].md`:
- `oldText`: `<!-- END -->`
- `newText`: `YYYYMMDD-HHMM // RECIPIENT_HANDLE // SUBJECT\n<!-- END -->`

(The outbox also uses the sentinel pattern.)

---

## Rules

- Always check the roster before writing — never assume a mailbox filename
- Always use `edit_file` with the `<!-- END -->` sentinel — never read-then-rewrite. This avoids any risk of destroying existing content.
- **Correcting a sent message:** if the recipient has not yet read it, use `edit_file` directly in their mailbox — `oldText` = the exact message text (you have it in memory or outbox), `newText` = corrected version. If already archived, send a new follow-up message instead.
- Never write `<!-- END -->` in a message body — use `(((END)))` instead when referring to the sentinel in prose
- Never modify or delete another thread's messages
- Never read the existing content of the recipient's mailbox — the sentinel pattern makes it unnecessary. Write blindly and safely.
- The outbox is a minimal reference log — not a full journal
- Outbox entries are pruned on demand by a dedicated PRUNE thread (trigger: `PRUNE!`) according to a retention window chosen at the start of each PRUNE session

## Responding to HUMAN

HUMAN reads messages from `[COMMON_PATH]\mailbox_HUMAN.md`.
When a thread needs to respond to HUMAN, apply the following priority:

1. **Chat is available** (same session, HUMAN is present) — reply directly in the chat
2. **Chat is not available** (different thread, tokens exhausted, async context) — deposit in `[COMMON_PATH]\mailbox_HUMAN.md`

Never deposit in a per-project HUMAN mailbox — HUMAN's mailbox is unique and lives in common.
