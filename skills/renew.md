---
name: renew
description: Replace a saturating or crashed thread with a fresh one. The outgoing thread (or an informed substitute) writes a handover message and generates the startup prompt for the new thread. No roster changes, no arrival messages — transparent to the rest of the team.
---

# renew — Replace a saturating thread

## Objective
Ensure continuity when a thread needs to be replaced — due to context saturation or an unexpected crash. The handle, role and messaging files remain untouched. Only a fresh conversation is opened.

---

## When to use
- A thread is saturating (context too long, degraded responses)
- A thread crashed mid-task
- Run by: the outgoing thread itself, any sufficiently informed thread, or HUMAN manually

---

## Triggers

| Trigger | Behaviour |
|---|---|
| `RENEW?` | The thread honestly self-assesses its saturation level and reports in chat — **no action taken** |
| `RENEW!` | Executes the full renewal procedure (steps 1→3), with a confirmation pause on the handover message before depositing it |

### RENEW? — Self-assessment
The thread reflects on its own state and reports:
- Estimated context fill (low / medium / high / critical)
- Any signs of degraded performance noticed
- Current task and next steps if renewed now
- Recommendation: continue, plan renewal soon, or renew immediately

This is informational only — respond in chat, no files are written.

### RENEW! — Launch renewal
Execute steps 1→3 of the procedure below.
Before depositing the handover message, always show it to the user and ask for confirmation or adjustments.
Once confirmed, deposit and generate the startup prompt.

---

## Procedure

### 1. Write the handover message
Compose a structured message and deposit it in `./mailbox_[HANDLE].md`:

```
[HANDLE] // YYYYMMDD-HHMM // H // Handover // 
Current task: [what was in progress]
Recent decisions: [key decisions made this session]
Watch out for: [known issues, traps, pending questions]
Next steps: [what the new thread should do first]
```

Keep it factual and concise — the new thread will read this at startup via MAIL!

### 2. Log in outbox
If written by another thread, log in `./outbox_[SENDER_HANDLE].md`:
```
YYYYMMDD-HHMM // [HANDLE] // Handover
```
If written by the outgoing thread itself, log in its own outbox.

- **If the handover deposit (step 1) succeeds but the outbox log (step 2) fails:** do not re-deposit the handover — it is already in the mailbox and in context. Retry the outbox log only.

### 3. Generate the startup prompt
Produce the ready-to-paste message to open the new thread.

**Resolve paths first:** check `[COMMON_PATH]\projects_config.md` for the project's absolute path. If `projects_config.md` is not available, fall back to `[PROJECT]` placeholder — the user replaces manually.

**Skills to read at startup:** propose a list of relevant skills based on the thread's role, and ask the user to confirm or adjust before generating the prompt.

```
[Suggested model: claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-6 — human chooses at thread creation]
Respond in [LANGUAGE].
Read [PROJECT_PATH]\ETAT_ACTUEL.md.
[Read also: SKILL_PATH_1, SKILL_PATH_2, ...] (confirmed by user above)
You are [HANDLE], [ROLE] in [PROJECT_PATH]\
Your handle is [HANDLE]. Your mailbox is [PROJECT_PATH]\mailbox_[HANDLE].md.
Read [PROJECT_PATH]\roster.md and [COMMON_PATH]\roster.md to know your team.
Read now: [COMMON_PATH]\skills\mailbox_read.md
Read also: [COMMON_PATH]\skills\m_AI_l_help.md
Then send MAIL! to read your first messages — your predecessor left you instructions.
Messages tagged SELF// in your mailbox are notes from a previous generation of your own handle.
To contact a team member, use mailbox_write.md — do not reply in chat.
```

---

## Convention SELF// — inter-generation dialogue

A thread can write to its own mailbox to communicate with its successor (or its still-active predecessor) beyond the standard handover.

**Convention:** use the `SELF//` tag in the subject to distinguish these messages from regular incoming messages.

```
[HANDLE] // YYYYMMDD-HHMM // [PRIORITY] // SELF// [SUBJECT] // Message body
```

**Usage:**
- The outgoing thread enriches its mailbox with notes, deeper context, or questions for its successor
- If two instances are active simultaneously, they can dialogue via the shared mailbox
- HUMAN decides in which thread to call `MAIL!` — they orchestrate exchanges manually
- The successor must call `MAIL!` before replying to avoid duplicates
- A `SELF//` message in the successor's mailbox means it was written by a previous generation of the same handle

---

## Rules

- Never modify roster.md — the handle and role stay the same
- Never create new mailbox or outbox files — they already exist
- Never send arrival messages to other threads — the renewal is transparent to the team
- The handover message priority is always H (High) — it must be read first
- If no outgoing thread is available (crash), HUMAN or another thread writes the handover manually
