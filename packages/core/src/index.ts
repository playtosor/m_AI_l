// Core messaging services - common library for MCP and UI clients
export { readMail } from "./services/read-mail";
export { writeMail } from "./services/write-mail";
export { cancelMail } from "./services/cancel-mail";
export { editMail } from "./services/edit-mail";
export { archiveMail } from "./services/archive-mail";
export { initMail } from "./services/init-mail";
export { getProjectsService as getProjects } from "./services/get-projects";
export { getRosterService as getRoster } from "./services/get-roster";
export { getOutboxService as getOutbox } from "./services/get-outbox";
export { getMemberContextService as getMemberContext } from "./services/get-member-context";
export { handoverSelfService as handoverSelf } from "./services/handover-self";
export { resolveHandleCandidatesService as resolveHandleCandidates } from "./services/resolve-handle-candidates";
export { readRecentArchiveService as readRecentArchive } from "./services/read-recent-archive";

// Message-level operations (archive/delete单个消息)
export { archiveMessage } from "./services/archive-message";
export { deleteMessage } from "./services/delete-message";

// Core helpers for coordinateur facade (V2.5)
export { listMessages } from "./services/list-messages";
export { countMessages } from "./services/count-messages";
export { ensureMailboxFiles } from "./services/ensure-mailbox-files";

// Admin destructive ops (V2.6) — transactional delete / rename with rollback
export { deleteHandle } from "./services/delete-handle";
export { renameHandle } from "./services/rename-handle";

// Handle management
export { upsertHandle } from "./services/upsert-handle";

// Post-create hook
export { getPostCreateHookStatus, configurePostCreateHook, clearPostCreateHook, runPostCreateHook } from "./services/post-create-hook";

// Admin functions (wrappers around src/admin/)
export { bootstrapCommonMessaging } from "./admin/index";
export { createMessagingProject } from "./admin/index";
export { validateMessagingBootstrap } from "./admin/index";
export { adminPruneMessaging } from "./admin/index";

// Mailbox tool core (for opencode plugin)
export { mailboxWithLib, type MailboxInput, type MailboxResult, type Lib } from "./tools/mailbox-core";

// Handle validation helpers (used by MCP server)
export { assertValidHandleSyntax, HANDLE_SYNTAX_RE } from "./lib/handles";
