import { HUMAN_HANDLE } from "./constants";

export type Priority = "H" | "M" | "L";

export type Handle = string;

export interface MailboxRef {
  project_handle: string;
  handle: string;
}

/**
 * Selectable recipient in the coordinateur "send a message" form.
 * - handle: a specific agent in a specific project
 * - human: the cross-project HUMAN inbox
 */
export type RecipientOption =
  | { kind: "handle"; project_handle: string; handle: string; role: string }
  | { kind: "human"; handle: typeof HUMAN_HANDLE };

export interface Message {
  sender: string;
  timestamp: string;
  priority: Priority;
  subject: string;
  body: string;
}

export interface MessageKey {
  sender: string;
  timestamp: string;
  subject: string;
}

export interface RosterEntry {
  handle: string;
  role: string;
  mailbox: string;
  status: "active" | "inactive";
}

export interface ProjectEntry {
  name: string;
  path: string;
  roster?: string;
  language?: string;
  status?: "active" | "inactive";
}

/**
 * Snapshot returned by `Lib.readMail` (mailbox + invalid_lines + warning_count).
 * Shared by tools/mailbox.ts and tools/mailbox-core.ts so the two
 * OpenCode-facing entry points agree on the shape. `messages` uses the
 * canonical `Message` type (with Priority-typed `priority` field).
 */
export interface MailboxSnapshot {
  messages: Message[];
  invalid_lines: string[];
  warning_count: number;
}

/**
 * Result of `writeMail`. Surfaces the effective sender and the timestamp
 * actually stamped on the message, plus a partial-failure flag when the
 * outbox ledger write fails (the message is still delivered, but the sender's
 * outbox entry is dropped). Callers must surface `outboxWriteFailed` so the
 * agent is not told a full success (SIMPLIFY critical-feedback #11).
 */
export interface WriteMailResult {
  effectiveSender: string;
  timestamp: string;
  outboxWriteFailed: boolean;
}

/**
 * Service surface the opencode plugin tools project onto. `readMail` and
 * `writeMail` accept an optional `roster` pass-through (V2.5 SIMPLIFY WS6
 * finding #15) so callers can hand a pre-fetched roster to avoid the
 * filesystem read on the hot path.
 *
 * V2.5 SIMPLIFY WS6 — this interface was previously duplicated in
 * src/tools/mailbox-core.ts and src/tools/mailbox.ts (with the
 * mailbox.ts drop the `roster` parameter, causing a divergence).
 */
export interface Lib {
  readMail(
    projectHandle: string,
    handle: string,
    options?: {
      limit?: number;
      noArchive?: boolean;
      mailboxOverride?: string;
      roster?: RosterEntry[];
    }
  ): MailboxSnapshot;

  writeMail(
    projectHandle: string,
    sender: string,
    recipient: string,
    priority: string,
    subject: string,
    body: string,
    mailboxOverride?: string,
    senderProjectHandle?: string,
    roster?: RosterEntry[]
  ): WriteMailResult;

  upsertHandle(input: {
    project_handle: string;
    handle: string;
    role: string;
    mailbox?: string;
    status?: string;
  }): { status: string; project_handle: string; handle: string; role: string; mailbox: string; roster_status: string };

  getRoster(projectHandle: string): RosterEntry[];

  getProjects(): Array<{ name: string; path: string }>;
}

export type Project = ProjectEntry;

export interface OutboxEntry {
  timestamp: string;
  recipient: string;
  subject: string;
}

export interface MemberContext {
  project_handle: string;
  project_path: string;
  project_language?: string;
  handle: string;
  role: string;
  status: "active" | "inactive";
  mailbox: string;
  resolved_mailbox: string;
  resolved_archive: string;
  resolved_outbox: string;
  is_special_handle: boolean;
}

export interface HandleResolutionCandidate {
  project_handle: string;
  project_path: string;
  handle: string;
  role: string;
  status: "active" | "inactive";
  mailbox: string;
  resolved_mailbox: string;
}

export interface HandleResolutionResult {
  query_handle: string;
  current_project_handle?: string;
  current_project_source: "explicit" | "cwd" | "none";
  resolution_scope_used: "current_project" | "common" | "global" | "none" | "ambiguous";
  candidates: HandleResolutionCandidate[];
  /**
   * Projects whose roster could not be read during the global fallback scan.
   * Surfaced so a caller can distinguish "handle not found anywhere" from
   * "some projects were never scanned" (SIMPLIFY critical-feedback #12).
   * Empty unless a roster read failed.
   */
  skipped_projects?: string[];
}

export interface ReadRecentArchiveResult {
  status: "ok" | "ambiguous" | "not_found";
  handle: string;
  limit: number;
  resolved_project_handle?: string;
  resolution_scope_used: HandleResolutionResult["resolution_scope_used"];
  count: number;
  messages: Message[];
  invalid_count?: number;
  warning_count?: number;
  candidates?: HandleResolutionCandidate[];
}

// ============================================================================
// Configuration persistence types - Core common library
// ============================================================================

export interface ProjectMessagingConfig {}

export interface PostCreateHookConfig {
  enabled: boolean;
  mode: "command";
  command_path: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
  payload_mode: "stdin_json";
}

export interface GlobalMessagingConfig {
  post_create_hook?: PostCreateHookConfig;
}

export interface PostCreateHookStatus {
  configured: boolean;
  mode?: "command";
  command_path?: string;
  /**
   * Present when the global config file exists but is corrupt. Lets callers
   * distinguish "not configured" from "misconfigured" (SIMPLIFY #13).
   */
  error?: string;
}

export interface RunPostCreateHookInput {
  project_handle: string;
  project_path: string;
  trigger: "manual";
  requested_by: { kind: "human"; handle: typeof HUMAN_HANDLE } | { kind: "agent"; project_handle: string; handle: string };
  payload?: Record<string, unknown>;
}

export interface RunPostCreateHookResult {
  status: "success" | "error";
  exit_code?: number;
  stdout?: string;
  stderr?: string;
}

export interface ArchiveMessageResult {
  status: "archived";
  archived_message: Message;
}

export interface DeleteMessageResult {
  status: "deleted";
  deleted_message: Message;
}

export interface UpsertHandleInput {
  project_handle: string;
  handle: string;
  role: string;
  mailbox?: string;
  status?: string;
  /**
   * V3.0 BAC 2A follow-up: when true, the call THROWS
   * `RosterEntryExistsError` if the handle already exists in the roster,
   * instead of silently updating it. Use this for "register" semantics
   * where the caller wants to fail loudly on duplicates. Default false
   * (upsert behaviour preserved for backwards compatibility).
   */
  strict?: boolean;
}

export interface UpsertHandleResult {
  status: "created" | "updated";
  project_handle: string;
  handle: string;
  role: string;
  mailbox: string;
  roster_status: string;
}
