---
name: mailbox-read
description: Read, interpret and archive messages from your mailbox. Execute at session start if included in your onboarding instructions, or on demand when the user sends MAIL!
---

# mailbox_read — Read and archive incoming messages

## Objective
Process messages from your mailbox, acknowledge them naturally, and archive them silently.

---

## Triggers

| Trigger | Behaviour |
|---|---|
| `MAIL!` | Read, interpret and archive all messages in your mailbox — execute immediately |
| `MSG?` | HUMAN only — count pending messages in `mailbox_HUMAN.md` without archiving. HUMAN can then clear or archive manually. |
| `HELP!` | Read and execute `m_AI_l_help.md` from your COMMON_PATH — present the command summary to the user |
| `HELP! TRIGGER` | Read and execute `m_AI_l_help.md` — present only the reference card for the specified trigger (e.g. `HELP! RENEW!`) |
| `PRUNE!` | Generate the PRUNE thread startup prompt and present it to the user — read `prune.md` from your COMMON_PATH for the exact prompt template |
| `INVITE WRITE` | Generate a startup prompt for a CLAUDE_WEB write session — read `invite_prompt.md` from your COMMON_PATH |
| `INVITE READ` | Generate a startup prompt for a CLAUDE_WEB read session — read `invite_prompt.md` from your COMMON_PATH |

---

## When to use
- At the start of each session (if included in amorçage instructions)
- Immediately when the user's message starts with `MAIL!`

---

## Procedure

### 1. Read your active mailbox
Access `./mailbox_[YOUR_HANDLE].md` in the project folder.

- If empty or missing: do nothing, continue normally.
- If messages are present: proceed to step 2.

### 2. Interpret each message
For each message (format: `HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body`):

- Understand the content and its potential impact on your session
- Acknowledge naturally in one short sentence in the conversation  
  *(e.g. "Got a message from ARCHI: naming convention has changed, noted.")*
- If a message is ambiguous or raises a question: ask before archiving

### 3. Archive silently
Once all messages are understood and doubts resolved:

- **Before appending:** verify that `<!-- END -->` is present in `./mailbox_[YOUR_HANDLE]_archive.md` using `tail:1`. If absent, add it with `edit_file` or `write_file` before continuing.
- Append the full content of `./mailbox_[YOUR_HANDLE].md` to `./mailbox_[YOUR_HANDLE]_archive.md` using `edit_file` — `oldText` = `<!-- END -->`, `newText` = messages + `<!-- END -->`. The sentinel is always present at the end of the archive and moves forward with each archiving cycle.
- Reset `./mailbox_[YOUR_HANDLE].md` to sentinel-only using `write_file` with content `<!-- END -->` — do not leave it fully empty
- Do not mention the archiving in the conversation unless an error occurs
- **If the append succeeds but the reset operation fails:** do not re-append — the messages are already in context and already archived. Retry the reset operation only.

---

## Message format reference

```
HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Message body
```

| Field | Values | Description |
|-------|--------|-------------|
| HANDLE | sender's identifier | e.g. ARCHI, HUMAN, GPT_AGENT |
| YYYYMMDD-HHMM | timestamp | Send date and time — also serves as message ID |
| PRIORITY | H / M / L | High / Medium / Low |
| SUBJECT | short free text | Theme or title |
| Body | free text | Message content |

---

## Rules

- **If `MAIL!` arrives alongside other requests in the same message, complete the full procedure (steps 1→3) before addressing anything else.**
- One short natural acknowledgment per message — no detailed report
- Archive silently unless a problem occurs
- If a message is unclear: ask before archiving
- Never delete the mailbox file, even when empty
- **SELF// messages** are inter-generation notes from a previous instance of your own handle. Treat them like any other message (read, acknowledge, archive). Do not deposit a new SELF// message at the end of a normal session — this is reserved for the `renew.md` workflow.
