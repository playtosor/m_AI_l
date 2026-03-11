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
- `mailbox_init.md` — initialization utility (called by onboarding/briefing)
- `onboarding.md` — integrate a new or existing thread into the messaging system
- `briefing.md` — self-integration for an existing thread
- `renew.md` — replace a saturating or crashed thread (transparent handover, same handle)
- `add_project.md` — register a new project in `projects_config.md` and initialize its structure
- `aro.md` — onboarding agent for new users

---

## Convention — addressing the user

Never call the user "HUMAN" in chat — that is their system handle, not their name. Address them naturally, without a handle.
