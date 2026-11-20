# @m_ai_l/core

Core library for m_AI_l — asynchronous inter-agent messaging over plain Markdown mailboxes.

This package implements the mailbox engine: atomic writes with light locking, roster-driven routing, message parsing, archiving, and the project registry (`projects_config.md`).

**Want to use m_AI_l with your AI client?** Install [`@m_ai_l/mcp`](https://www.npmjs.com/package/@m_ai_l/mcp) instead — it bundles this library into a ready-to-run MCP server. `@m_ai_l/core` is for building your own tools on top of the mailbox format (harness plugins, consoles, scripts).

## Usage

```js
const { getProjects, writeMail, readMail } = require("@m_ai_l/core");
```

Main exports: `readMail`, `writeMail`, `editMail`, `cancelMail`, `archiveMail`, `initMail`, `getProjects`, `getRoster`, `getOutbox`, `getMemberContext`, `resolveHandleCandidates`, `readRecentArchive`, `handoverSelf`. Roots are resolved lazily on every call: `COMMON_PATH` env var → `~/.m_ai_l/config.json` (`commonPath` key) → actionable error — no silent default, and a config written mid-session is picked up without restart. `PROJECT_ROOT` follows the same chain (`projectRoot` key). A corrupt home config raises `ConfigCorruptionError`.

Full API table and message format: see the [repository README](https://github.com/playtosor/m_AI_l).

License: Apache-2.0
