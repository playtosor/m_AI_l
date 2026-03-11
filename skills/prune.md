---
name: prune
description: Garbage collection skill — archives old messaging data (mailbox archives, outboxes) across all active projects. Run by a dedicated PRUNE thread, invoked on demand via the PRUNE! trigger. Non-destructive: pruned content is moved to a pruned/ folder, never deleted.
---

# prune — Garbage collection for m_AI_l messaging files

## Objective
Keep messaging archives lean by moving old entries out of active files and into a `pruned/` folder, project by project. The process is interactive — the user validates each project before anything is touched.

---

## When to use
- When archives have grown large and are consuming unnecessary context
- Invoked on demand — not run automatically
- Run by a dedicated PRUNE thread, not by project threads

---

## Trigger

| Trigger | Behaviour |
|---|---|
| `PRUNE!` | Any thread receiving this trigger generates the PRUNE startup prompt and presents it to the user — the user then opens a dedicated PRUNE thread to execute the procedure |

### PRUNE! — Generate startup prompt
When any thread receives `PRUNE!`, it does **not** execute the pruning itself. Instead, it generates the ready-to-paste startup prompt for a dedicated PRUNE thread:

```
[Suggested model: claude-sonnet-4-6 — human chooses at thread creation]
Respond in [LANGUAGE].
You are PRUNE, a garbage collection agent for m_AI_l messaging files in [COMMON_PATH]\
Your handle is PRUNE. This is a single-use thread — no mailbox, no roster entry needed.
Read now: [COMMON_PATH]\skills\prune.md
Then execute the pruning procedure immediately.
```

---

## Scope

**Included:**
- `mailbox_[HANDLE]_archive.md` — all projects, including common
- `outbox_[HANDLE].md` — all projects, including common

**Excluded:**
- `mailbox_[HANDLE].md` (active inboxes — never touched)
- `ETAT_ACTUEL.md` (requires project knowledge — out of scope)
- Any other project files

---

## Procedure

### 1. Read projects_config.md
Read `[COMMON_PATH]\projects_config.md` to get the list of all active projects and their paths.

### 2. Set retention window
Propose a default retention window to the user:
> "I'll keep entries from the last 30 days and move older ones to a `pruned/` folder in each project. Would you like to adjust this window?"

**Wait for user confirmation or adjustment before proceeding.**

The retention window applies to all projects uniformly in this session.

### 3. Process each project — one at a time

For each active project listed in `projects_config.md`:

**a) Inspect**
Scan the project folder for files in scope (`mailbox_*_archive.md`, `outbox_*.md`). Use `get_file_info` to retrieve the size of each file before reading it.
**Your only output during the entire inspection phase is silence.** The first text you produce is the report in step (b)

For each file found, apply the following four-step strategy to minimise context consumption. This strategy assumes entries are stored in **chronological order** (oldest first) — which is the standard m_AI_l convention.

**a0) Size check — before any read**
Check the file size.
- If the file exceeds **20kb**: do not read it — not now, not during execution. Mark it immediately as "flagged for archiving" and notify (this is an exception to silence) the user with the following message:
> "[FILENAME] ([SIZE]kb) — this file is too large to be read safely without risking context saturation. It will be moved to `pruned/` in its entirety. It may contain recent entries, but preserving system performance takes priority. You will find it in the `pruned/` folder."
- Otherwise: proceed to a1.

**a1) Tail read — quick eligibility check**
Read the last 5 lines of the file (`tail: 5`).
- If the file appears empty or contains no dated entries: **skip silently**.
- If lines are returned but contain no `YYYYMMDD-HHMM` date pattern — likely the body of a long message — widen the tail progressively (`tail: 20`, then `tail: 30`) until a dated header is found.
  - If no date is found after `tail: 30`: read the full file to avoid silently missing entries.
- If the most recent entry found is **older than the retention window**: the entire file is to be moved — no further reading needed, note it as "100% to move".
- If the most recent entry is **within the retention window**: the file may contain older entries at the top — proceed to a2.

**a2) Head read — find the cut-off line**
Read the first 20 lines of the file (`head: 20`).
- Identify the first entry that falls **within** the retention window.
- If all entries in this head sample are within the window: the file has nothing to move — **skip silently**.
- If the cut-off line is found within the head sample: note its position and proceed to a3.
- If all entries in the head sample are older than the window: the cut-off is deeper in the file — read the full file to locate it precisely.

**a3) Count**
Based on the information gathered in a1 and a2, determine:
- Total entries (estimate from full read if needed)
- Entries older than the retention window (to be moved)
- Entries within the window (to be kept)

**Example — nominal case**
File: `mailbox_ARCHI_archive.md` (8kb) — retention window: 30 days, today: 20260311
- a0: 8kb < 20kb → proceed
- a1: tail:5 returns an entry dated 20260308 → within window → proceed to a2
- a2: head:20 shows entries starting from 20260201 → cut-off found at line 6 (first entry within window: 20260215)
- a3: 5 entries to move (20260201–20260214), 12 entries to keep (20260215→present)

**b) Report and pause**
Present a summary to the user:
> "Project [HANDLE] — [PROJECT_PATH]
> Files found: [list]
> Entries to move: [N] (older than [DATE])
> Entries to keep: [N]
> Oversized files (will be moved in full): [list, or 'none']
> Proceed, skip this project, or stop entirely?"

**Wait for user answer before touching any file.**

**c) Execute (if confirmed)**
For each file with entries to move:

1. Create `[PROJECT_PATH]\pruned\` if it does not exist

2. **Case: file was flagged as oversized (a0)** — move the entire file:
   - Write the full content to `[PROJECT_PATH]\pruned\[FILENAME]_[YYYYMMDD].md` (no append — always a new timestamped file to avoid accumulation)
   - Rewrite the source file as empty (keep the file, clear the content)

3. **Case: file has a cut-off line (a1/a2/a3)** — partial move:
   - Extract all lines **before** the cut-off line identified in step a2/a3 (these are the entries to move)
   - If `[PROJECT_PATH]\pruned\[FILENAME]_[YYYYMMDD].md` already exists: append to it
   - Otherwise: create it with the extracted content
   - Rewrite the source file keeping only lines **from the cut-off line onwards**

**Never delete any file — only move or clear content.**

### 4. Final report
Once all projects are processed, summarize:
- Projects processed / skipped
- Total entries moved per project
- Location of pruned files (`pruned/` folder in each project)

---

## Rules

- Never modify active mailboxes (`mailbox_[HANDLE].md`) — archives and outboxes only
- Never delete files — always move content to `pruned/`
- Always pause and wait for user confirmation before processing each project
- If a file has no entries older than the retention window: skip it silently
- If `pruned/` already contains a file with the same name: append to it, do not overwrite — **except for oversized files (a0), which always get a new timestamped file to prevent accumulation**
- PRUNE is a single-use thread — no mailbox, no outbox, no roster entry
- Pruned content in `pruned/` is not managed by PRUNE — manual cleanup if needed
