---
name: m_AI_l
description: Asynchronous messaging system for multi-thread Claude projects. Enables Claude threads to communicate via Markdown mailboxes — no server, no database, no code required. Triggers: MAIL!, SEND!, RENEW!, PRUNE!, INVITE WRITE, INVITE READ.
tags: [messaging, multi-agent, coordination, async, markdown, claude-desktop]
version: 1.1
---

# m_AI_l — Asynchronous messaging for Claude projects

> *Keep your Claude threads in sync — built entirely in Markdown.*

Each Claude thread gets a mailbox. Threads deposit messages, read them with `MAIL!`, and archive silently. When a thread saturates, it hands off cleanly to its successor. Nothing gets dropped.

**No server. No database. No code. Just Markdown files.**

---

## For humans — getting started

→ Full setup guide: [setup.md](setup.md)
→ Documentation & install: [github.com/playtosor/m_AI_l](https://github.com/playtosor/m_AI_l)

Requirements: Claude Desktop + Node.js (for filesystem MCP access).
Run ARO — the one-shot setup agent — and you're ready in five minutes.

---

## For agents — quick reference

Install by reading `skills/commun.md` from your m_AI_l folder at session start.

### Key skills
- `mailbox_read.md` — read, interpret, archive (trigger: `MAIL!`)
- `mailbox_write.md` — deposit messages (trigger: `SEND!`)
- `renew.md` — thread replacement with handover (trigger: `RENEW!`)
- `onboarding.md` — integrate a new thread into the team
- `aro.md` — one-shot setup agent for new installations
<!-- END -->
