---
name: m_AI_l_help
description: User manual for m_AI_l — the asynchronous messaging system between Claude threads. All available commands, explained simply for a non-developer.
---

# m_AI_l — User Manual

m_AI_l is a messaging system between your Claude threads. Each thread can send and receive messages to other threads, even across different sessions. Messages are deposited in mailboxes and read at the start of each session.

To use a command, type it **at the beginning of your message**.

```
MAIL!           Reads your new messages
SEND?           Reflects on what is worth communicating
SEND!           Immediately sends a message to the team
SEND! HANDLE    Immediately sends a message to a specific thread
MSG?            Counts your pending messages without reading them
RENEW?          Checks whether this thread is approaching its limits
RENEW!          Replaces this thread with a fresh one
PRUNE!          Launches a cleanup of old messaging archives across all projects
HELP!           Displays this help
HELP! TRIGGER   Displays the details of a specific command
INVITE          Lists the available guest session modes
INVITE READ     Generates a prompt for a guest read-only session
INVITE WRITE    Generates a prompt for a guest write-only session
```

Type `HELP! TRIGGER` for the details of a specific command.

---

## Command reference

### MAIL!
What it does    : Reads all your new messages and archives them silently.
When to use it  : At the start of a session, or whenever you want to check your messages.
Example         : `MAIL!` → the thread reads and summarises each message in one sentence.
See also        : MSG?

---

### SEND?
What it does    : The thread reflects on what is worth communicating to the team and proposes a message — you validate before it is sent.
When to use it  : At the end of a session, when you are not sure whether anything needs to be shared.
Example         : `SEND?` → the thread proposes "I could inform ARCHI of the decision on the structure. Shall I send it?"
See also        : SEND!, SEND! HANDLE

---

### SEND!
What it does    : The thread reflects on what is worth communicating and sends immediately, without waiting for your validation.
When to use it  : When you trust the thread to decide on its own what is relevant to share.
Example         : `SEND!` → the thread sends a summary of the key decisions made during the session.
See also        : SEND?, SEND! HANDLE

---

### SEND! HANDLE
What it does    : Immediately sends a message to a specific thread, identified by its handle.
When to use it  : When you know exactly who you want to write to.
Example         : `SEND! ARCHI` → the thread composes and sends a message directly to ARCHI.
See also        : SEND!, SEND?

---

### MSG?
What it does    : Counts the number of messages waiting in your mailbox, without reading or archiving them.
When to use it  : To quickly check whether you have messages, without triggering a full read.
Example         : `MSG?` → "3 messages pending."
See also        : MAIL!

---

### RENEW?
What it does    : The thread honestly assesses its saturation level and reports in the chat — no action is taken.
When to use it  : When you feel the thread's responses are degrading, or after a long session.
Example         : `RENEW?` → "Context at approximately 70%. I recommend planning a renewal soon."
See also        : RENEW!

---

### RENEW!
What it does    : Prepares the replacement of this thread by a new one — writes a handover message, deposits it in the successor's mailbox, and generates the startup text to paste into a new thread.
When to use it  : When a thread is saturating or has crashed. The new thread picks up exactly where the previous one left off.
Example         : `RENEW!` → the thread prepares the handover, shows you the message for validation, then generates the text to paste.
See also        : RENEW?

---

### PRUNE!
What it does    : Generates a startup prompt for a dedicated PRUNE thread that cleans up old messaging archives (mailbox archives and outboxes) across all active projects. Pruned content is moved to a `pruned/` folder — nothing is permanently deleted.
When to use it  : When archives have grown large, or when you want to keep the system lean.
Example         : `PRUNE!` → the thread generates the PRUNE startup prompt — you open a new thread, it handles the cleanup project by project with a confirmation pause at each step.
See also        : RENEW!

---

### HELP!
What it does    : Displays the m_AI_l system summary and the list of all available commands.
When to use it  : When you cannot remember a command or want a quick reminder.
Example         : `HELP!` → displays this manual.
See also        : HELP! TRIGGER

---

### HELP! TRIGGER
What it does    : Displays the detailed reference card for a specific command — what it does, when to use it, and an example.
When to use it  : When you want to understand the exact behaviour of a command before using it.
Example         : `HELP! RENEW!` → displays the detailed card for RENEW!
See also        : HELP!

---

### HELP! INVITE
What it does    : Displays the details of all INVITE commands grouped together — INVITE, INVITE READ, and INVITE WRITE.
When to use it  : When you want to understand the guest session system as a whole before choosing a mode.
Example         : `HELP! INVITE` → displays the three entries below in sequence.
See also        : HELP!, HELP! TRIGGER

---

### INVITE
What it does    : Lists the two available guest session modes for reading or writing messages outside a regular thread.
When to use it  : When you want to check what guest session types are available.
Example         : `INVITE` → displays the two available modes: READ and WRITE.
See also        : INVITE READ, INVITE WRITE

---

### INVITE READ
What it does    : Generates a startup prompt for a guest claude.ai session that can read mailboxes and context files without archiving or modifying them.
When to use it  : When you need to quickly check messages or files from a separate chat session, outside your regular thread.
Example         : `INVITE READ` → generates a prompt to copy-paste into a new claude.ai chat window. The session reads and reports, but takes no action.
See also        : INVITE, INVITE WRITE

---

### INVITE WRITE
What it does    : Generates a startup prompt for a guest claude.ai session that can deposit a message into a mailbox without access to the full thread session.
When to use it  : When you want to send a quick update to the team from outside your regular working thread.
Example         : `INVITE WRITE` → generates a prompt to copy-paste into a new claude.ai chat window. The session writes a message signed as CLAUDE_WEB and deposits it.
See also        : INVITE, INVITE READ

---

## Glossary

**Thread** — An open Claude conversation dedicated to a specific role (e.g. architect, developer, packager). Each thread has a unique handle.

**Handle** — A thread's short identifier, no spaces (e.g. ARCHI, PKG, BAT). It is the thread's "name" within the system.

**Mailbox** — A thread's inbox. Messages are deposited there by other threads and read via `MAIL!`.

**Skill** — An instruction file that a Claude thread can read to acquire a specific behaviour or capability.

**Saturation** — A Claude thread has a limited session memory. As it approaches its limits, its responses may degrade. `RENEW?` detects this state; `RENEW!` resolves it.
