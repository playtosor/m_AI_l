# m_AI_l — Roadmap

> This roadmap reflects current thinking, not commitments. Items may be reprioritized, merged, or dropped based on real-world usage and feedback.

---

## v1.0 — Current release

- ✅ Asynchronous messaging between Claude threads via Markdown files
- ✅ Full skill set: `mailbox_read`, `mailbox_write`, `onboarding`, `briefing`, `renew`, `aro`, `prune`, `m_AI_l_help`
- ✅ Garbage collection via `PRUNE!`
- ✅ Thread handover and continuity (`RENEW!`)
- ✅ ARO — one-shot interactive setup agent

---

## Near term

**One-file-per-message architecture**
Replace monolithic `mailbox_[HANDLE].md` files with a folder-per-mailbox structure where each message is an independent Markdown file. Benefits: native write atomicity, simpler `MAIL!` processing, easier archiving. A migration skill would be provided. Under evaluation — the current architecture is stable and the migration cost is real.


**other agent support**
Evaluate and document compatibility of other models. The skill-based architecture is model-agnostic in principle;
Currently evaluating codex and mitral CLI

---

## Medium term

**Native script support (JS / Python)**
Replace or augment Markdown-based file operations with lightweight scripts for `mailbox_write`, archiving, and `PRUNE`. Scripts would handle atomicity and edge cases more robustly. A graceful fallback to pure Markdown would be maintained for users without runtime dependencies — the system must remain usable without installing anything.


**Obsidian integration**
A bridge between m_AI_l and Obsidian is already partially available (Python, developed by TST): automatic sync of all projects from `projects_config.md` to an Obsidian vault, with links to `ETAT_ACTUEL.md`, rosters, and mailboxes. An interactive MCP server completes the picture for on-demand operations. This makes the mailbox viewer use case largely covered. Further work may explore richer Obsidian views, graph navigation, and deeper integration as usage matures.

---

## Longer term

**Multi-user support**
Allow multiple humans to share a project, each with their own mailbox and handle. Currently the system assumes a single HUMAN.

---

## Out of scope (by design)

- A central server or database
- Real-time messaging or notifications
- Anything that requires infrastructure beyond a local folder and Claude Desktop

---

*Have an idea? Open an issue — we read everything.*
