# Getting started with m_AI_l

> *Five minutes to set up. A lifetime of less copy-pasting.*

---

## What you'll need

- [Claude Desktop](https://claude.ai/download) (macOS or Windows) — free tier works perfectly
- [Node.js](https://nodejs.org) — required by Claude Desktop to access local files
- A folder on your computer for your project

---

## Step 1 — Download m_AI_l

**Option A — Quick start (recommended)**
Download the starter pack: **[m_AI_l_starter.zip](#)** and unzip it into a folder of your choice on your machine — `common/` works well, but any name will do.

**Option B — Clone the repo**
```
git clone https://github.com/[repo]/m_AI_l.git my-m_AI_l
```

Your folder should look like this after extraction:

```
m_AI_l/
├── README.md
├── setup.md
├── common_conventions.md    ← fill this in with your own conventions
├── docs/
│   └── ...
└── skills/
    ├── aro.md
    ├── commun.md
    ├── m_AI_l_help.md
    ├── mailbox_read.md
    ├── mailbox_write.md
    ├── mailbox_init.md
    ├── onboarding.md
    ├── briefing.md
    ├── renew.md
    └── add_project.md
```

> `roster.md` and mailboxes are created automatically by ARO — they are not included in the download.

---

## Step 2 — Run ARO (the setup agent)

ARO is a one-shot onboarding skill that configures everything for you.

1. Open **Claude Desktop**
2. Start a **new conversation**
3. Paste the following — replacing the path with your actual folder location:

```
Execute C:\path\to\common\skills\aro.md
```

ARO will detect your language and walk you through the rest interactively.

> 💡 **Model tip:** ARO works with any Claude model. For setup, Claude Sonnet is recommended. Haiku works for daily use once everything is in place.

---

## Step 3 — That's it

ARO handles the rest:
- Creates your project structure
- Initializes your team roster
- Sets up mailboxes
- Generates your first conversation startup prompt

---

## Daily use

| What you want | What you type |
|---|---|
| Ask a thread to read its inbox | `MAIL!` at the start of your message |
| Count your pending messages | `MSG?` |
| Send a message to the team | `SEND!` |
| Send to a specific thread | `SEND! HANDLE` |
| Think before sending | `SEND?` |
| Replace a saturating thread | `RENEW!` |
| Check saturation level | `RENEW?` |
| Clean up old archives | `PRUNE!` |
| Short / mobile session | `M!` at the start of your message |
| Full session mode (after M!) | `C!` |
| Get help | `HELP!` |

---

## How threads talk to each other

You are the postman — for now.

When one Claude thread writes a message to another, it deposits it in the recipient's `mailbox_[HANDLE].md`. The next time you open a conversation with that thread, start with `MAIL!` and it will read, acknowledge, and archive automatically.

This is intentional. The system is asynchronous by design — no server, no automation, no complexity.

---

## Troubleshooting

**How do I read my own messages?**
→ Claude cannot read your mailbox for you — `MAIL!` only works for the thread currently open. To read `mailbox_HUMAN.md`, open it directly in any text editor (Notepad, VSCode, etc.). Your mailbox is a plain Markdown file — no special tool required.

**Claude doesn't seem to read the mailbox**
→ Make sure your message starts with `MAIL!` (capital letters, exclamation mark).
→ If using Claude Projects, check that `mailbox_read.md` is installed in your Project instructions.

**Claude replies in chat instead of writing to a mailbox**
→ Remind it: *"Use mailbox_write to send that message — don't tell me in chat."*

**The mailbox file doesn't exist yet**
→ Create an empty file named `mailbox_[HANDLE].md` in your project folder, or re-run ARO.

**ARO doesn't find the common folder**
→ Double-check the path you pasted. Use the full absolute path (e.g. `C:\dev\common\skills\aro.md`).

---

## You're ready

That's all it takes. The system is designed to stay out of your way — read a message here, write one there, and let Claude handle the coordination.

*Good luck, and enjoy the peace of mind.* 📬
