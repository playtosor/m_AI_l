---
name: commun
description: m_AI_l discovery hub and shared resources. Read at the start of each session.
---

# Shared resources & m_AI_l

## Local conventions

If `common_conventions.md` exists in your COMMON_PATH, read it now — it contains conventions specific to this installation (environments, navigation rules, session conventions, etc.).

---

## m_AI_l — Inter-thread messaging system

Each project can use an asynchronous messaging system between its threads. Skills available in the `skills\` folder of your COMMON_PATH :

- `mailbox_read.md` — read and archive messages (see this skill for `MAIL!` and `MSG?` triggers)
- `mailbox_write.md` — send or cancel messages (triggers: `SEND?`, `SEND!`, `SEND! HANDLE`)
- `mailbox_init.md` — initialization utility (called by onboarding)
- `onboarding.md` — integrate a new or existing thread into the messaging system
- `renew.md` — replace a saturating or crashed thread (transparent handover, same handle)
- `add_project.md` — register a new project in `projects_config.md` and initialize its structure
- `aro.md` — onboarding agent for new users

---

## Convention — sentinel in message body

Never write `<!-- END -->` in the body of a message — it is the sentinel used by `edit_file` and will corrupt the mailbox on insertion. Use `(((END)))` as a synonym when referring to the sentinel in prose.

---

## Convention — message follow-up

If you sent a message and received no response, you may follow up once.
If the message is older than 8 days, presume it has been read — do not follow up unprompted.
If the topic is still active, a single polite check is acceptable:
*"I see my message dates back X days — was it received?"*

---

## Convention — addressing the user

Never call the user "HUMAN" in chat — that is their system handle, not their name. Address them naturally, without a handle.

---

## CLAUDE_WEB — transient instances

A message signed `CLAUDE_WEB` was sent from a claude.ai session (web or mobile) outside any regular thread. It has no roster entry and no outbox.
Treat it as a message written on behalf of or in collaboration with the user.
