# Contributing to m_AI_l

Thank you for your interest in contributing. Before submitting anything, please read this document — it will save us both time.

---

## Philosophy first

m_AI_l is built on a few strong convictions. A contribution that contradicts them will be declined regardless of its technical quality.

**Markdown is not a compromise — it's the point.**
Files readable by humans, writable by AI, requiring nothing to run. Any contribution that introduces a dependency, a database, a server, or a build step goes against the core design.

**Simplicity over features.**
The system is designed to stay out of your way. A new skill or command must earn its place — not by being useful in theory, but by solving a real friction point that the current system cannot address.

**Zero setup is a promise.**
A new user should be able to go from download to first session in five minutes. Contributions that add steps to that path need a very strong justification.

**The system eats its own cooking.**
m_AI_l was built using m_AI_l. Contributions should be tested on a real installation, not just reviewed in theory.

---

## Before opening a PR

**Open an issue first.**
Describe the problem you're solving, not the solution you have in mind. This lets us align on whether the problem is real and whether your approach fits the project before you invest time in a PR.

PRs without a prior issue will be closed with a request to open one.

---

## What we welcome

- Bug fixes with a clear reproduction case
- Documentation improvements (clarity, accuracy, missing cases)
- New skills that solve a real coordination problem and fit the Markdown-pure philosophy
- Translations of `README.md` and `setup.md`

## What we will decline

- Contributions that introduce non-Markdown storage (databases, JSON files, etc.)
- New commands or skills without a documented real-world use case
- Breaking changes to the message format (`HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body`)
- Anything that requires changes to existing installations without a migration path

---

## Contribution rules

- **One PR, one change.** Keep it atomic — a bug fix and a new feature in the same PR will be asked to split.
- **Test on a real installation.** Not on a mock, not in theory. If you're contributing a skill, it must have been run through Claude Desktop with actual files.
- **Respect the tone.** Documentation in this project is written for non-developers. Keep it plain, concrete, and jargon-free where possible.
- **AI-assisted contributions are welcome** — but you are responsible for what you submit. Review it, test it, own it.

---

## A note on AI-generated PRs

We use AI to build this project. We have no objection to contributors doing the same.

What we do expect: that you have read, understood, and tested what you submit. A PR that was generated and submitted without review is easy to spot and will be closed.

---

## Questions?

Open an issue with the `question` label. We read everything.
