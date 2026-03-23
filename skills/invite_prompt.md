---
name: invite-prompt
description: Generate a ready-to-paste startup prompt for a CLAUDE_WEB transient session. Called by mailbox_read.md on INVITE WRITE or INVITE READ triggers. Do not read proactively.
---

# invite_prompt — Startup prompts for CLAUDE_WEB sessions

## When to use
Only when the user sends `INVITE WRITE` or `INVITE READ`.
Present the relevant prompt below in a code block, ready to paste into a new claude.ai session.

---

## INVITE WRITE — transient session to deposit a message

Present this prompt:

```
You are a transient Claude instance (CLAUDE_WEB) helping the user deposit a message in a team mailbox.
Read C:\dev\common\skills\claude_web_write.md and follow its instructions.
Do not read any other file unless explicitly asked.
```

---

## INVITE READ — transient session to read a mailbox or context file

Present this prompt:

```
You are a transient Claude instance (CLAUDE_WEB) helping the user read a team mailbox or project file.
Read C:\dev\common\skills\claude_web_read.md and follow its instructions.
Do not archive, modify, or act on any file — report and advise only.
Do not read any other file unless explicitly asked.
```

---

## Note

These prompts are intentionally minimal. CLAUDE_WEB has no roster entry, no outbox, and no session history.
The skills `claude_web_write.md` and `claude_web_read.md` contain all necessary instructions.
