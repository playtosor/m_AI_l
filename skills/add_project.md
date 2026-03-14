---
name: add-project
description: Utility skill — registers a new project in projects_config.md and initializes its messaging structure. Called by ARO or COMMON, or run directly by an advanced user.
---

# add_project — Register a new project

## Objective
Add a project to the central configuration and set up its messaging infrastructure (roster, HUMAN mailbox pointer).

---

## When to use
- When creating a new project under the common infrastructure
- Called by `aro.md` during guided onboarding
- Called by COMMON when upgrading an existing project
- Can be run directly by an advanced user

---

## Inputs required

| Field | Description |
|-------|-------------|
| `PROJECT_HANDLE` | Short uppercase identifier for the project (e.g. YOURPROJECT, MAZE) |
| `PROJECT_PATH` | Absolute path to the project root (e.g. `C:\yourdevroot\yourproject`) |
| `COMMON_PATH` | Absolute path to common (read from `projects_config.md` if it exists) |
| `LANGUAGE` | Default language for this project (e.g. `fr`, `en`). If not specified, inherit from the `Default language` header in `projects_config.md`. |

---

## Procedure

### 1. Locate projects_config.md
Check for `[COMMON_PATH]\projects_config.md`.
- If it exists: read it and proceed to step 2
- If it does not exist: create it with headers first:

```markdown
# projects_config.md
| Project handle | Absolute path | Roster | Language | Status |
|----------------|---------------|--------|----------|--------|
```

Also create the archive file if missing:
```markdown
# projects_config_archive.md
| Project handle | Absolute path | Archived on | Reason |
|----------------|---------------|-------------|--------|
```

### 2. Verify PROJECT_PATH
Check that `PROJECT_PATH` exists on the filesystem.
- If it does not exist: inform the user and stop — ask them to create the folder first before running this skill again.

### 3. Check for duplicates
If `PROJECT_HANDLE` already exists in `projects_config.md`, do not stop — instead, diagnose and propose a recovery path:

- **Project registered AND folder healthy** (roster.md present, expected files in place):
  > "This project is already registered and looks operational. Would you like to invite a new thread?"
  Offer to run `onboarding.md` directly.

- **Project registered BUT files missing** (roster.md absent or incomplete):
  > "This project is registered but [X, Y] are missing. I can create them — shall I?"
  Wait for confirmation before creating the missing files.

- **User wants a distinct new project**:
  > "This handle is already in use. What handle would you like for this new project?"
  Resume from step 2 with the new handle.

### 4. Add the project to projects_config.md
Append a row:
```markdown
| [PROJECT_HANDLE] | [PROJECT_PATH] | [PROJECT_PATH]\roster.md | [LANGUAGE] | active |
```

### 5. Initialize project messaging structure
In `PROJECT_PATH`, create the following if they do not already exist:

- `roster.md` — with HUMAN pointing to common:

```markdown
| Handle | Role | Mailbox | Status |
|--------|------|---------|--------|
| HUMAN | Vision, arbitrage, recrutement | [COMMON_PATH]\mailbox_HUMAN.md | active |
```

- Do **not** create mailbox files for HUMAN in the project folder — HUMAN's mailbox is unique and lives in common.

### 6. Confirm
Summarize in natural language:
- Row added to `projects_config.md`
- Files created in project folder (or already existed)
- Suggest next step: run `onboarding.md` to invite the first threads

---

## Rules

- Never overwrite existing files
- PROJECT_HANDLE must be unique in projects_config.md
- Never create HUMAN mailbox files in a project folder
- If COMMON_PATH is unknown, ask the user before proceeding
- If PROJECT_PATH == COMMON_PATH (transverse project registered in common itself), skip the HUMAN roster line — it already exists
