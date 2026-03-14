---
name: onboarding
description: Invite and integrate a new thread (Claude, external agent, human or script) into a project team. Run by the inviting thread, not the new member. Calls mailbox_init.md internally.
---

# onboarding — Invite a new team member

## Objective
Gather information about a new thread, set up its messaging infrastructure, and optionally announce its arrival to the existing team.

---

## When to use
- When creating any new discussion thread on a project
- When any new agent joins the team (Claude, GPT, automated script, human, etc.)
- Run by the **inviting thread**, not the new member

---

## Procedure

### 0. Is this thread new or existing?
Ask the user before anything else:
> "Is this a brand new thread, or an existing thread joining the messaging system?"

**Wait for answer** — the response conditions steps 4 and 6.

---

### 1. Collect information — in 3 rounds
Ask the user in three distinct steps, waiting for an answer between each.

**Round 1 — Identity**
- **Handle** — short unique identifier, no spaces (e.g. ARCHI, DEV_FRONT, BAT)
- **Role** — short description of the thread's mission on this project

**Wait for answer before continuing.**

**Round 2 — Scope**
- **Type** — Claude / external agent / human / script
- **Scope** — what it covers, what it does not cover

**Wait for answer before continuing.**

**Round 3 — Technical details** *(defaults apply if not specified)*
- **Suggested model** *(only if thread is new — step 0, human decides)* — propose a model based on the thread's complexity:
  - `Haiku` — simple, repetitive, or lightweight tasks
  - `Sonnet` — standard development and architecture work *(default)*
  - `Opus` — complex reasoning, critical decisions
- **Arrival message** — send to *(default: none)*:
  - **All** active threads in `roster.md`
  - **None**
  - **Selection** — which ones? *(consult roster.md for the list)*

**Wait for answer before continuing.**

### 2. Confirm before acting
Summarize the collected information and ask for explicit confirmation:
> "I'm about to create the messaging files for [HANDLE] ([ROLE]) in [PROJECT_PATH]. Shall I proceed?"
**Wait for user confirmation before proceeding.**

### 3. Initialize messaging files
Execute `mailbox_init.md` with:
- HANDLE, ROLE, current PROJECT_PATH

### 4. Deposit a welcome message in the new thread's mailbox *(only if thread is new)*
Use `mailbox_write.md` to write to `./mailbox_[HANDLE].md`:

```
[SENDER_HANDLE] // YYYYMMDD-HHMM // H // Welcome // Hi [HANDLE], welcome to the team.
Your role: [ROLE]. Your scope: [SCOPE].
Your mailbox is at [PROJECT_PATH]\mailbox_[HANDLE].md — read it with MAIL! at the start of each session.
To contact any team member, use mailbox_write.md. Do not respond in the chat.
```

### 5. Send arrival message (if applicable)
Use `mailbox_write.md` to deposit the following in each selected recipient's mailbox:

```
[HANDLE] // YYYYMMDD-HHMM // L // Arrival // Hi, I'm [HANDLE] ([TYPE]).
My role: [ROLE]. My scope: [SCOPE].
I read my mailbox at the start of each session.
```

Log each send in `./outbox_[HANDLE].md`.

### 6. Confirm
Summarize in natural language:
- Roster updated
- Files created
- Welcome message deposited in [HANDLE]'s mailbox (if new thread)
- Arrival messages sent to: [list or "none"]

### 7. Generate the onboarding prompt
Produce the ready-to-paste startup message the user will send to open the new thread.

**Resolve paths first:** check `[COMMON_PATH]\projects_config.md` for the project's absolute path. If `projects_config.md` is not available, fall back to `[PROJECT]` placeholder — the user replaces manually.

**Skills to read at startup:** propose a list of relevant skills based on the thread's role, and ask the user to confirm or adjust before generating the prompt. Always include `[COMMON_PATH]\skills\svn-workflow\SKILL.md` — this skill applies to all threads on all projects.

Display it clearly in a code block:

```
[Suggested model: claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-6 — human chooses at thread creation]
Respond in [LANGUAGE].
Read [PROJECT_PATH]\ETAT_ACTUEL.md.
[Read also: SKILL_PATH_1, SKILL_PATH_2, ...] (confirmed by user above)
You are [HANDLE], [ROLE] in [PROJECT_PATH]\
Your handle is [HANDLE]. Your mailbox is [PROJECT_PATH]\mailbox_[HANDLE].md.
Read [PROJECT_PATH]\roster.md and [COMMON_PATH]\roster.md to know your team.
Read now: [COMMON_PATH]\skills\mailbox_read.md
Then send MAIL! to read your first messages.
To contact a team member, use mailbox_write.md — do not reply in chat.
```

Adjust the role description and scope to match what was collected in step 1.

---

## Rules

- Always check roster.md before writing — HANDLE must be unique
- The arrival message announces the new member to the team. It is written by the inviting thread, referring to the new member in third person. Deposit in existing members' mailboxes, NOT in the new member's mailbox.
- If the project has no roster.md yet, mailbox_init will create it
- This skill is agent-agnostic: Claude, external agent or human can follow it
- HUMAN's mailbox is unique and lives in common — never create it in a project folder (handled by mailbox_init)
- For transverse threads (common team members such as COMMON, BAT, ARO…), PROJECT_PATH = COMMON_PATH — adjust the startup prompt accordingly and omit the duplicate roster line
