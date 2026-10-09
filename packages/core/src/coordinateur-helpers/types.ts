// Types for coordinateur_helpers facade
// These match the spec in specifications_coordinateur.md exactly.

import { HUMAN_HANDLE } from "../domain/constants";
import type {
  MailboxRef as DomainMailboxRef,
  Message as DomainMessage,
  Handle as DomainHandle,
  Project as DomainProject,
  RecipientOption as DomainRecipientOption,
  HandleResolutionResult,
} from "../domain/types";
import type {
  PruneInput,
  PruneResult,
} from "../admin/types";

// Re-export core public types so UI consumers can pull everything from the
// coordinateur facade barrel without dipping into messaging_core_helpers.
export type Message = DomainMessage;
export type Handle = DomainHandle;
export type Project = DomainProject;
export type RecipientOption = DomainRecipientOption;

export type Priority = "H" | "M" | "L";

// Identity types
export interface HumanRef {
  kind: "human";
  handle: typeof HUMAN_HANDLE;
}

export interface AgentRef {
  kind: "agent";
  project_handle: string;
  handle: string;
}

export type SenderRef = HumanRef | AgentRef;

export type RecipientRef =
  | { kind: "handle"; project_handle: string; handle: string };

// Mailbox types
export type MailboxRef = DomainMailboxRef;

export interface MessageRef {
  mailbox: MailboxRef;
  sender: string;
  timestamp: string;
  subject: string;
}

// Input/Output types for each helper

// 1. Identity, projects, navigation
export interface CoordListProjectsOptions {
  include_inactive?: boolean;
}

export interface CoordListProjectsResult {
  projects: Array<{
    project_handle: string;
    project_path: string;
    roster_path?: string;
    language?: string;
    status?: string;
  }>;
}

export interface CoordListProjectHandlesOptions {
  include_inactive?: boolean;
  include_human?: boolean;
}

export interface CoordListProjectHandlesResult {
  project_handle: string;
  handles: Array<{
    handle: string;
    role: string;
    mailbox: string;
    status: string;
    is_human: boolean;
  }>;
}

export interface CoordGetMemberContextResult {
  project_handle: string;
  project_path: string;
  project_language?: string;
  handle: string;
  role: string;
  status: string;
  mailbox: string;
  resolved_mailbox: string;
  resolved_archive: string;
  resolved_outbox: string;
  is_special_handle: boolean;
}

// 2. Message reading
export interface CoordListMailboxMessagesInput {
  mailbox: MailboxRef;
  source?: "active" | "archive";
  limit?: number;
}

export interface CoordListMailboxMessagesResult {
  mailbox: MailboxRef;
  source: "active" | "archive";
  count: number;
  messages: Array<{
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  }>;
  invalid_count?: number;
  warning_count?: number;
}

export interface CoordGetMessageActionsInput {
  actor: SenderRef;
  message: MessageRef;
}

export interface CoordGetMessageActionsResult {
  can_read: boolean;
  can_archive: boolean;
  can_delete: boolean;
  can_edit: boolean;
  can_change_sender: boolean;
  edit_mode: "in_place_or_correction" | "none";
}

export interface CoordGetOutboxInput {
  project_handle: string;
  handle: string;
}

export interface CoordGetOutboxResult {
  project_handle: string;
  handle: string;
  count: number;
  outbox: Array<{ timestamp: string; recipient: string; subject: string }>;
}

// 3. Writing
export interface CoordSendMessageInput {
  sender: SenderRef;
  recipient: RecipientRef;
  priority: Priority;
  subject: string;
  body: string;
}

export interface CoordSendMessageResult {
  status: "sent" | "ambiguous" | "not_found";
  sender: SenderRef;
  recipient: RecipientRef;
  effective_sender?: string;
  resolved_project_handle?: string;
  resolution_scope_used?: HandleResolutionResult["resolution_scope_used"];
  candidates?: Array<{
    project_handle: string;
    handle: string;
    role: string;
    status: string;
    mailbox: string;
    resolved_mailbox: string;
  }>;
}

export interface CoordEditMessageInput {
  actor: SenderRef;
  message: MessageRef;
  patch: {
    new_priority?: Priority;
    new_subject?: string;
    new_body?: string;
  };
}

export interface CoordEditMessageResult {
  status: "updated" | "correction_sent";
  previous: {
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  } | null;
  message: {
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  };
}

export interface CoordCancelSentMessageInput {
  actor: SenderRef;
  message: MessageRef;
}

export interface CoordCancelSentMessageResult {
  status: "cancelled";
  removed: {
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  };
}

// 4. Item operations
export interface CoordArchiveMessageInput {
  actor: SenderRef;
  message: MessageRef;
}

export interface CoordArchiveMessageResult {
  status: "archived";
  archived_message: {
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  };
}

export interface CoordDeleteMessageInput {
  actor: SenderRef;
  message: MessageRef;
}

export interface CoordDeleteMessageResult {
  status: "deleted";
  deleted_message: {
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  };
}

// 5. Admin
export interface CoordBootstrapCommonMessagingInput {
  language?: string;
  ensure_common_entry?: boolean;
  dry_run?: boolean;
}

export interface CoordBootstrapCommonMessagingResult {
  status: "ok" | "warning" | "error";
  common_path: string;
  created: string[];
  updated: string[];
  warnings: string[];
  errors: string[];
}

export interface CoordCreateProjectInput {
  project_handle: string;
  project_path: string;
  status?: string;
  project_path_mode?: "strict" | "create";
  dry_run?: boolean;
}

export interface CoordCreateProjectResult {
  status: "ok" | "warning" | "error";
  project_handle: string;
  project_path: string;
  created: string[];
  updated: string[];
  warnings: string[];
  errors: string[];
}

export interface CoordValidateMessagingBootstrapInput {
  project_handle?: string;
}

export interface CoordValidateMessagingBootstrapResult {
  status: "ok" | "warning" | "error";
  checks: Array<{
    name: string;
    status: "ok" | "warning" | "error";
    details?: string;
  }>;
  warnings: string[];
  errors: string[];
}

export interface CoordUpsertHandleInput {
  project_handle: string;
  handle: string;
  role: string;
  mailbox?: string;
  status?: string;
  /**
   * V3.0 BAC 2A follow-up: when true, throws RosterEntryExistsError if
   * the handle already exists. Default false (upsert behaviour).
   */
  strict?: boolean;
}

export interface CoordUpsertHandleResult {
  status: "created" | "updated";
  project_handle: string;
  handle: string;
  role: string;
  mailbox: string;
  roster_status: string;
}

export interface CoordReadRecentArchiveInput {
  handle: string;
  current_project_handle?: string;
  limit?: number;
}

export interface CoordReadRecentArchiveResult {
  status: "ok" | "ambiguous" | "not_found";
  handle: string;
  resolved_project_handle?: string;
  resolution_scope_used: HandleResolutionResult["resolution_scope_used"];
  count: number;
  messages: Array<{
    sender: string;
    timestamp: string;
    priority: Priority;
    subject: string;
    body: string;
  }>;
  candidates?: Array<{
    project_handle: string;
    handle: string;
    role: string;
    status: string;
    mailbox: string;
    resolved_mailbox: string;
  }>;
}

// 6. Hook post-creation
export interface CoordGetPostCreateHookStatusResult {
  configured: boolean;
  mode?: "command";
  command_path?: string;
}

export interface CoordRunPostCreateHookInput {
  project_handle: string;
  project_path: string;
  trigger: "manual";
  requested_by: SenderRef;
  payload?: Record<string, unknown>;
}

export interface CoordRunPostCreateHookResult {
  status: "success" | "error";
  exit_code?: number;
  stdout?: string;
  stderr?: string;
}

// 7. Admin destructive workflows (V2.5 Tranche 4A).
// HUMAN console access is the trust boundary — no assertAdminActor gate.
// admin the project whose entrypoint they hold). See delivery note for the
// deviation from the brief (brief had `project_handle?`).
export interface CoordAdminPruneInput extends Omit<PruneInput, "include_common"> {
  /** @deprecated Kept for console payload compatibility; ignored by the facade (A2). */
  actor: SenderRef;
}
export type CoordAdminPruneResult = PruneResult;
