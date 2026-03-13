# m_AI_l `v1.0.1`

> *Asynchronous messaging for human–AI collaborative projects — built entirely in Markdown.*

---

## The problem

When you work with Claude across multiple conversations, each thread is an island.

Your coding assistant doesn't know what your writing assistant decided. Your research thread ignores what your planning thread concluded. **You** are the only link — manually copy-pasting context between sessions, rebuilding the same shared understanding over and over. And when a thread hits its context limit, you're back to square one.

This doesn't scale.

---

## The solution

**m_AI_l** is a lightweight coordination system for multi-thread, human–AI projects.

No database. No custom server. Just a handful of Markdown files that act as a shared memory layer between your Claude conversations.

Each thread gets a mailbox. You drop messages in. Claude reads, acts, and archives. Everyone stays in sync — asynchronously, reliably, without you having to repeat yourself. And when a thread reaches its limit, it hands off cleanly to its successor. Nothing gets dropped.

---

## Never lose a thread

Claude conversations have a context limit. When a thread saturates or gets interrupted, the usual outcome is: you start over, you re-explain, you lose momentum.

m_AI_l handles this differently. When a thread is nearing its limit, it prepares a structured handover — decisions made, state of play, next steps — and deposits it in its successor's mailbox. The new thread reads it via `MAIL!` and picks up exactly where the previous one left off.

To the rest of the team, nothing happened.

This makes long-running projects genuinely sustainable. Not just *"Claude with better memory"* — but a system where **continuity is built in, and nothing gets dropped**.

---

## Who is this for?

**m_AI_l is designed for non-developers** who use Claude for complex, ongoing projects and feel the friction of starting from scratch every conversation.

If you've ever thought *"I wish Claude remembered what we decided last week"* — this is for you.

Tokens running out mid-session? Drop a quick message to the relevant thread before you lose your train of thought. It'll be waiting when you come back.

Developers working with Claude Code or agent frameworks will likely prefer more powerful tooling. This system optimizes for **simplicity and zero setup**.

*Already using Claude's built-in memory? Good. Memory knows your preferences — m_AI_l coordinates your projects. They work better together.*

---

## How it works

```
common/
├── roster.md            ← Team directory: who's here, what role, what mailbox
├── mailbox_HUMAN.md     ← Your inbox
├── mailbox_ARCHI.md     ← Claude thread "ARCHI" inbox
├── mailbox_DEV.md       ← Claude thread "DEV" inbox
└── skills/              ← Behaviour instructions for Claude
    ├── mailbox_read.md
    ├── mailbox_write.md
    └── ...
```

Every message follows a simple standard format:

```
SENDER // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body
```

That's it. No tooling required. Works with Claude Projects, local files, or any folder you can share between tabs.

---

## The skills

m_AI_l comes with a set of Claude skills you install once and use everywhere:

| Skill | What it does |
|---|---|
| `mailbox_read` | Claude reads its inbox, acts on messages, archives silently |
| `mailbox_write` | Claude deposits messages and can cancel them |
| `onboarding` | Invites and integrates any new team member — Claude thread, external agent, or human |
| `briefing` | Self-integration for an existing thread joining the system mid-project |
| `renew` | Replaces a saturating or crashed thread transparently — same handle, handover via mailbox |
| `aro` | One-shot setup agent — configures your whole installation interactively |
| `prune` | Garbage collection — moves old archives to a `pruned/` folder, project by project |
| `m_AI_l_help` | Full command reference, readable by both humans and Claude |

---

## Available commands

| Command | What it does |
|---|---|
| `MAIL!` | Read and archive all pending messages |
| `MSG?` | Count pending messages without reading them |
| `SEND!` | Reflect and send relevant updates to the team |
| `SEND! HANDLE` | Send a message to a specific thread |
| `SEND?` | Propose a message for your validation before sending |
| `RENEW?` | Check thread saturation level |
| `RENEW!` | Replace this thread with a fresh one, handover included |
| `PRUNE!` | Launch a cleanup of old messaging archives across all projects |
| `HELP!` | Display the full command reference |

---

## Getting started

> **Requires [Claude Desktop](https://claude.ai/download)** — m_AI_l uses the filesystem MCP to read and write local files. The web version of Claude is not supported.

> **New to m_AI_l?** Read [`setup.md`](setup.md) first — it covers prerequisites and installation.

Run ARO — the one-shot setup agent:

```
Execute C:\path\to\common\skills\aro.md
```

ARO detects your language, walks you through configuration, and generates your first conversation startup prompt.

Full setup guide → [`setup.md`](setup.md)

---

## Known limitations

- **Archive files grow over time** — use `PRUNE!` periodically to move old entries to a `pruned/` folder and keep the system lean.

---

## Origin

m_AI_l was built to coordinate the team that built it — from day one.

Every design decision, every skill update, every handover between threads went through the system itself. The architecture you're reading about is the same one that was used to write it.

*Developed entirely with Claude's free tier — because good systems shouldn't require premium access to exist.*

---

## License

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — use it, adapt it, build on it. Just keep the credit.

---

*A project by a one-person multinational.* 🌍
