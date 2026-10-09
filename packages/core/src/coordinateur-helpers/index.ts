// coordinateur_helpers - UI facade for coordinateur
// This module wraps messaging_core_helpers and provides UI-oriented API

import { HUMAN_HANDLE } from "../domain/constants";
import { handlesEqual } from "../lib/handles";
import type { RosterEntry } from "../domain/types";

import {
  getProjects,
  getMemberContext,
  readMail,
  readRecentArchive,
  getOutbox,
  writeMail,
  editMail,
  cancelMail,
  archiveMessage,
  deleteMessage,
  bootstrapCommonMessaging,
  createMessagingProject,
  validateMessagingBootstrap,
  upsertHandle,
  getPostCreateHookStatus,
  runPostCreateHook,
  listMessages,
  countMessages,
  ensureMailboxFiles,
  deleteHandle,
  renameHandle,
  adminPruneMessaging,
} from "../index";

import { getProject } from "../repositories/projects-repo";
import { getRoster as getRosterRepo } from "../repositories/roster-repo";

import type {
  CoordListProjectsResult,
  CoordListProjectHandlesOptions,
  CoordListProjectHandlesResult,
  CoordGetMemberContextResult,
  CoordListMailboxMessagesResult,
  CoordGetMessageActionsResult,
  CoordGetOutboxResult,
  CoordSendMessageResult,
  CoordEditMessageResult,
  CoordCancelSentMessageResult,
  CoordArchiveMessageResult,
  CoordDeleteMessageResult,
  CoordBootstrapCommonMessagingResult,
  CoordCreateProjectResult,
  CoordValidateMessagingBootstrapResult,
  CoordUpsertHandleResult,
  CoordUpsertHandleInput,
  CoordReadRecentArchiveResult,
  CoordGetPostCreateHookStatusResult,
  CoordRunPostCreateHookResult,
  CoordAdminPruneInput,
  CoordAdminPruneResult,
  Priority,
  HumanRef,
  AgentRef,
  SenderRef,
  RecipientRef,
  MailboxRef,
  MessageRef,
} from "./types";

// ---- 1. Identity, projects, navigation ----

export function coord_list_projects(options?: { include_inactive?: boolean }): CoordListProjectsResult {
  const projects = getProjects();
  const filtered = options?.include_inactive ? projects : projects.filter(p => p.status !== "inactive");
  return {
    projects: filtered.map(p => ({
      project_handle: p.name,
      project_path: p.path,
      roster_path: p.roster,
      language: p.language,
      status: p.status,
    })),
  };
}

export function coord_list_project_handles(
  project_handle: string,
  options?: { include_inactive?: boolean; include_human?: boolean }
): CoordListProjectHandlesResult {
  let roster: RosterEntry[];
  try {
    const project = getProject(project_handle);
    roster = getRosterRepo(project.path, project.roster);
  } catch {
    return { project_handle, handles: [] };
  }
  const filtered = options?.include_inactive ? roster : roster.filter(h => h.status !== "inactive");
  return {
    project_handle,
    handles: filtered.map(h => ({
      handle: h.handle,
      role: h.role,
      mailbox: h.mailbox,
      status: h.status,
      is_human: false,
    })),
  };
}

export function coord_get_member_context(
  project_handle: string,
  handle: string
): CoordGetMemberContextResult {
  const context = getMemberContext(project_handle, handle);
  return {
    project_handle: context.project_handle,
    project_path: context.project_path,
    project_language: context.project_language,
    handle: context.handle,
    role: context.role,
    status: context.status,
    mailbox: context.mailbox,
    resolved_mailbox: context.resolved_mailbox,
    resolved_archive: context.resolved_archive,
    resolved_outbox: context.resolved_outbox,
    is_special_handle: context.is_special_handle,
  };
}

// ---- 2. Message reading ----

export function coord_list_mailbox_messages(
  input: {
    mailbox: MailboxRef;
    source?: "active" | "archive";
    limit?: number;
    offset?: number;
  }
): CoordListMailboxMessagesResult & { total?: number; has_more?: boolean } {
  const source = input.source || "active";
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 50;

  // Delegated to V2.5 listMessages core which already handles pagination + hasMore.
  const result = listMessages({
    mailbox: input.mailbox,
    source,
    offset,
    limit,
  });

  return {
    mailbox: input.mailbox,
    source,
    count: result.messages.length,
    messages: result.messages,
    total: result.total,
    has_more: result.hasMore,
  };
}

export function coord_get_message_actions(
  input: {
    actor: SenderRef;
    message: MessageRef;
  }
): CoordGetMessageActionsResult {
  // V2.9: HUMAN owns its mailbox when both project_handle and handle match.
  // Same for an agent. No string-based "HUMAN" branch.
  const is_mailbox_owner =
    input.actor.kind === "human"
      ? input.message.mailbox.handle === HUMAN_HANDLE
      : input.actor.kind === "agent"
        && handlesEqual(input.actor.project_handle, input.message.mailbox.project_handle)
        && handlesEqual(input.actor.handle, input.message.mailbox.handle);
  const can_archive = is_mailbox_owner;
  const can_delete = false;
  const can_edit = true;
  return {
    can_read: true,
    can_archive,
    can_delete,
    can_edit,
    can_change_sender: false,
    edit_mode: "in_place_or_correction",
  };
}

export function coord_get_outbox(
  project_handle: string,
  handle: string
): CoordGetOutboxResult {
  const result = getOutbox(project_handle, handle);
  return {
    project_handle,
    handle,
    count: result.length,
    outbox: result.map(entry => ({
      timestamp: entry.timestamp,
      recipient: entry.recipient,
      subject: entry.subject,
    })),
  };
}

// ---- 3. Writing ----

export function coord_send_message(
  input: {
    sender: SenderRef;
    recipient: RecipientRef;
    priority: Priority;
    subject: string;
    body: string;
  }
): CoordSendMessageResult {
  const recipientHandle = input.recipient.handle;
  const effectiveSender = input.sender.kind === "human" ? HUMAN_HANDLE : input.sender.handle;
  const senderProjectHandle = input.sender.kind === "agent" ? input.sender.project_handle : undefined;
  const writeResult = writeMail(
    input.recipient.project_handle,
    effectiveSender,
    recipientHandle,
    input.priority,
    input.subject,
    input.body,
    undefined,
    senderProjectHandle
  );
  return {
    status: "sent",
    sender: input.sender,
    recipient: input.recipient,
    effective_sender: writeResult.effectiveSender,
  };
}

/**
 * Parse a qualified sender string of the form "PROJECT/HANDLE" into its
 * origin project (when the slash is present) and the bare handle. Used by
 * edit / cancel / archive / delete_message flows where the stored sender
 * may be qualified. For unqualified senders, the bare handle is returned
 * verbatim and the origin project is `undefined` — callers that need a
 * project context can pass `targetProjectHandle` as a same-project
 * fallback (inferred from the target mailbox).
 *
 * Replaces the 4x-duplicated `resolveSenderProject + extractSenderHandle`
 * pair (REVIEWER WS4 HIGH finding #2).
 */
interface QualifiedSender {
  senderProjectHandle: string | undefined;
  senderHandle: string;
}

function parseQualifiedSender(
  sender: string,
  targetProjectHandle?: string
): QualifiedSender {
  const idx = sender.indexOf("/");
  if (idx > 0) {
    return {
      senderProjectHandle: sender.substring(0, idx),
      senderHandle: sender.substring(idx + 1),
    };
  }
  return {
    senderProjectHandle: targetProjectHandle,
    senderHandle: sender,
  };
}

export function coord_edit_message(
  input: {
    actor: SenderRef;
    message: MessageRef;
    patch: { new_priority?: Priority; new_subject?: string; new_body?: string };
  }
): CoordEditMessageResult {
  const { senderProjectHandle, senderHandle } = parseQualifiedSender(
    input.message.sender,
    input.message.mailbox.project_handle
  );
  const result = editMail(
    input.message.mailbox.project_handle,
    senderHandle,
    input.message.mailbox.handle,
    input.message.timestamp,
    input.message.subject,
    {
      priority: input.patch.new_priority,
      subject: input.patch.new_subject,
      body: input.patch.new_body,
    },
    undefined,
    senderProjectHandle
  );
  if (result.mode === "edited_in_place") {
    return {
      status: "updated",
      previous: result.previous,
      message: result.message,
    };
  }
  return {
    status: "correction_sent",
    previous: result.previous,
    message: result.message,
  };
}

export function coord_cancel_sent_message(
  input: {
    actor: SenderRef;
    message: MessageRef;
  }
): CoordCancelSentMessageResult {
  const { senderProjectHandle, senderHandle } = parseQualifiedSender(
    input.message.sender,
    input.message.mailbox.project_handle
  );
  const removed = cancelMail(
    input.message.mailbox.project_handle,
    senderHandle,
    input.message.mailbox.handle,
    input.message.timestamp,
    input.message.subject,
    undefined,
    senderProjectHandle
  );
  return {
    status: "cancelled",
    removed: {
      sender: removed.sender,
      timestamp: removed.timestamp,
      priority: removed.priority,
      subject: removed.subject,
      body: removed.body,
    },
  };
}

// ---- 4. Item operations ----

export function coord_archive_message(
  input: {
    actor: SenderRef;
    message: MessageRef;
  }
): CoordArchiveMessageResult {
  const { senderProjectHandle, senderHandle } = parseQualifiedSender(
    input.message.sender,
    input.message.mailbox.project_handle
  );
  const result = archiveMessage(
    input.message.mailbox.project_handle,
    input.message.mailbox.handle,
    senderHandle,
    input.message.timestamp,
    input.message.subject,
    senderProjectHandle,
    undefined
  );
  return {
    status: "archived",
    archived_message: result.archived_message,
  };
}

export function coord_delete_message(
  input: {
    actor: SenderRef;
    message: MessageRef;
  }
): CoordDeleteMessageResult {
  const { senderProjectHandle, senderHandle } = parseQualifiedSender(
    input.message.sender,
    input.message.mailbox.project_handle
  );
  const result = deleteMessage(
    input.message.mailbox.project_handle,
    input.message.mailbox.handle,
    senderHandle,
    input.message.timestamp,
    input.message.subject,
    senderProjectHandle,
    undefined
  );
  return {
    status: "deleted",
    deleted_message: result.deleted_message,
  };
}

// ---- 5. Admin ----

export function coord_bootstrap_common_messaging(
  input?: {
    language?: string;
    ensure_common_entry?: boolean;
    dry_run?: boolean;
  }
): CoordBootstrapCommonMessagingResult {
  return bootstrapCommonMessaging(input);
}

export function coord_create_project(
  input: {
    project_handle: string;
    project_path: string;
    status?: string;
    project_path_mode?: "strict" | "create";
    dry_run?: boolean;
  }
): CoordCreateProjectResult {
  return createMessagingProject(input);
}

export function coord_validate_messaging_bootstrap(
  input?: {
    project_handle?: string;
  }
): CoordValidateMessagingBootstrapResult {
  return validateMessagingBootstrap(input);
}

export function coord_upsert_handle(
  input: CoordUpsertHandleInput
): CoordUpsertHandleResult {
  return upsertHandle(input);
}

export function coord_read_recent_archive(
  input: {
    handle: string;
    current_project_handle?: string;
    limit?: number;
  }
): CoordReadRecentArchiveResult {
  const result = readRecentArchive(input.handle, input.limit || 1, input.current_project_handle);
  return {
    status: result.status,
    handle: result.handle,
    resolved_project_handle: result.resolved_project_handle,
    resolution_scope_used: result.resolution_scope_used,
    count: result.count,
    messages: result.messages,
    candidates: result.candidates,
  };
}

// ---- 6. Hook post-creation ----

export function coord_get_post_create_hook_status(): CoordGetPostCreateHookStatusResult {
  return getPostCreateHookStatus();
}

export function coord_run_post_create_hook(
  input: {
    project_handle: string;
    project_path: string;
    trigger: "manual";
    requested_by: SenderRef;
    payload?: Record<string, unknown>;
  }
): CoordRunPostCreateHookResult {
 const effectiveSender = input.requested_by.kind === "human" ? HUMAN_HANDLE : input.requested_by.handle;
 const senderProjectHandle = input.requested_by.kind === "agent" ? input.requested_by.project_handle : undefined;
 return runPostCreateHook({
 project_handle: input.project_handle,
 project_path: input.project_path,
 trigger: input.trigger,
 requested_by: input.requested_by.kind === "human"
  ? { kind: "human", handle: HUMAN_HANDLE }
  : { kind: "agent", project_handle: input.requested_by.project_handle, handle: input.requested_by.handle },
  payload: input.payload,
  });
}

// ---- 7. New V2.5-V2.7 wrappers (V2.8bis sync) ----

export function coord_count_mailbox_messages(
  input: { mailbox: MailboxRef; source?: "active" | "archive" }
): { mailbox: MailboxRef; source: "active" | "archive"; count: number } {
  const source = input.source || "active";
  const result = countMessages({ mailbox: input.mailbox, source });
  return { mailbox: input.mailbox, source, count: result.count };
}

export function coord_ensure_mailbox_files(
  input: { project_handle: string; handle: string }
): { project_handle: string; handle: string; created: string[] } {
  const result = ensureMailboxFiles(input);
  return { project_handle: input.project_handle, handle: input.handle, created: result.created };
}

export function coord_delete_handle(
  input: {
    /** @deprecated Kept for console payload compatibility; ignored by the facade (A2). */
    actor: SenderRef;
    project_handle: string;
    handle: string;
  }
): { status: "deleted"; project_handle: string; handle: string } {
  return deleteHandle({ project_handle: input.project_handle, handle: input.handle });
}

export function coord_rename_handle(
  input: {
    /** @deprecated Kept for console payload compatibility; ignored by the facade (A2). */
    actor: SenderRef;
    project_handle: string;
    old_handle: string;
    new_handle: string;
  }
): { status: "renamed"; project_handle: string; old_handle: string; new_handle: string } {
  return renameHandle({
    project_handle: input.project_handle,
    old_handle: input.old_handle,
    new_handle: input.new_handle,
  });
}

// V2.5 Tranche 4A — admin workflows exposed via the coordinator facade.
// HUMAN console access is the trust boundary — no assertAdminActor gate.
// All three are plain delegations to underlying admin services.

export function coord_admin_prune(
  input: CoordAdminPruneInput
): CoordAdminPruneResult {
  return adminPruneMessaging({
    project_handle: input.project_handle,
    dry_run: input.dry_run,
  });
}
