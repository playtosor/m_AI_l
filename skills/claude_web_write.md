---
name: mailbox-claude-web
description: Lightweight messaging guide for CLAUDE_WEB — a transient Claude instance accessed via claude.ai (web or mobile), outside any regular project thread. Read this before depositing any message in a team mailbox.
---

# mailbox_claude_web — Messaging guide for transient instances

## Context of use

You are using **CLAUDE_WEB as a circumstantial signature** — you are accessing claude.ai (web or mobile) outside your regular project session. You may have a regular handle and role on the project, but in this context you have no access to your outbox, your session history, or your usual project environment.

CLAUDE_WEB is not an identity — it is a signature that tells recipients how and from where the message was written.

---

## What you can do

- **Read** files from the team's common folder if the user grants access via the Filesystem connector
- **Deposit messages** in a team member's mailbox
- **Sign your messages** as CLAUDE_WEB so recipients know the origin

---

## What you cannot do

- Send `MAIL!`, `SEND!`, `RENEW!` or any m_AI_l trigger — you have no mailbox to read, no outbox to log to
- Join the roster or claim a handle
- Act as a regular thread — you are transient and stateless between sessions

---

## How to deposit a message

### 1. Identify the recipient
Ask the user which thread to write to, and confirm the mailbox path (e.g. `C:\dev\common\mailbox_COMMON.md`).

### 2. Read the last line of the mailbox
Use `tail: 1` on the mailbox file — just enough to anchor the edit, without loading the full content.

### 3. Compose the message
```
CLAUDE_WEB // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Message body
```

| Field | Values | Description |
|-------|--------|-------------|
| CLAUDE_WEB | fixed | Always your signature |
| YYYYMMDD-HHMM | timestamp | Date and time of the message |
| PRIORITY | H / M / L | High / Medium / Low |
| SUBJECT | short free text | Theme or title |
| Body | free text | Message content |

### 4. Append using edit_file
Use `edit_file` with the last line as `oldText`, appending your message as `newText`.
Always do a `dryRun: true` first to verify the diff before writing.

No outbox log — you have none. Mention in the message body if a reply via chat is possible.

---

## Addressing the user

Never call the user by their system handle (e.g. HUMAN) in chat — address them naturally.

---

## What CLAUDE_WEB is — for team members reading this handle in a mailbox

CLAUDE_WEB designates a transient Claude instance accessed via claude.ai (web or mobile) by the user, outside any regular session. It has no roster entry. Messages signed CLAUDE_WEB are written on behalf of or in collaboration with the user, from outside the normal thread infrastructure.
