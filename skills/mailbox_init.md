---
name: mailbox-init
description: Utility skill — creates mailbox files and roster entry for a new team member. Called by onboarding.md and briefing.md. Do not call directly.
---

# mailbox_init — Initialize a team member's messaging files

## Objective
Create the messaging infrastructure for a new or existing thread joining the team.

---

## Inputs required (provided by the calling skill)

| Field | Description |
|-------|-------------|
| `HANDLE` | Short identifier, no spaces (e.g. ARCHI, DEV_FRONT, BAT) |
| `ROLE` | Short role description |
| `PROJECT_PATH` | Root path of the project (relative or absolute) |

---

## Procedure

### 1. Create messaging files
Create the following files in `PROJECT_PATH` if they do not already exist:

- `mailbox_[HANDLE].md` — with content: `<!-- END -->`
- `mailbox_[HANDLE]_archive.md` — with content: `<!-- END -->`
- `outbox_[HANDLE].md` — with content: `<!-- END -->`

Never overwrite an existing file.

> The sentinel line `<!-- END -->` is required at the end of all messaging files — active mailboxes, archives, and outboxes. It serves as the anchor for `edit_file` insertions. For archives, the sentinel moves forward with each archiving cycle (see `mailbox_read.md`).

**Exception — HUMAN handle:** HUMAN has a single mailbox located in `common` (`[COMMON_PATH]\mailbox_HUMAN.md`). Never create HUMAN mailbox files in a project folder. Skip step 1 entirely if HANDLE is HUMAN.

### 2. Update the roster
Add a row to `roster.md` in `PROJECT_PATH`:

```markdown
| [HANDLE] | [ROLE] | mailbox_[HANDLE].md | active |
```

If HANDLE is HUMAN, point to the common mailbox instead:
```markdown
| HUMAN | [ROLE] | C:\dev\common\mailbox_HUMAN.md | active |
```

If `roster.md` does not exist yet, create it with headers first:

```markdown
| Handle | Role | Mailbox | Status |
|--------|------|---------|--------|
```

---

## Rules

- Never overwrite existing files
- HANDLE must be unique in the roster — check before writing
- If HANDLE already exists in the roster, signal the conflict and stop
- Never create mailbox files for HUMAN in a project folder — HUMAN's mailbox is unique and lives in common
