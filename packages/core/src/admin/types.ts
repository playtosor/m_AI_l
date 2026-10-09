export interface AdminResult {
  status: "ok" | "warning" | "error";
  created: string[];
  updated: string[];
  warnings: string[];
  errors: string[];
}

export interface BootstrapCommonResult extends AdminResult {
  common_path: string;
}

export interface CreateProjectResult extends AdminResult {
  project_handle: string;
  project_path: string;
}

export interface ValidateResult extends AdminResult {
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  status: "ok" | "warning" | "error";
  details: string;
}

export interface BootstrapCommonInput {
  language?: string;
  ensure_common_entry?: boolean;
  dry_run?: boolean;
}

export interface CreateProjectInput {
  project_handle: string;
  project_path: string;
  status?: string;
  project_path_mode?: "strict" | "create";
  dry_run?: boolean;
}

export interface ValidateInput {
  project_handle?: string;
  dry_run?: boolean;
}

export interface PruneInput {
  retention_days?: number;
  project_handle?: string;
  include_common?: boolean;
  dry_run?: boolean;
}

export interface PruneProjectResult {
  project_handle: string;
  project_path: string;
  files_scanned: number;
  files_flagged: number;
  entries_to_move: number;
  entries_to_keep: number;
  actions: string[];
}

export interface PruneResult {
  status: "ok" | "warning" | "error";
  retention_days: number;
  projects: PruneProjectResult[];
  warnings: string[];
  errors: string[];
}

export interface ForensicReadInput {
  project_handle: string;
  handle: string;
  scope: "mailbox" | "archive" | "outbox";
  mailbox_override?: string;
  limit?: number;
  no_archive?: boolean;
}

export interface ForensicReadResult {
  status: "ok" | "warning" | "error";
  project_handle: string;
  handle: string;
  scope: string;
  resolved_mailbox_path: string;
  mailbox_override_used: boolean;
  messages: Array<{
    sender: string;
    timestamp: string;
    priority: string;
    subject: string;
    body: string;
  }>;
  archived_count: number;
  warnings: string[];
  errors: string[];
}

export interface InspectRoutingInput {
  project_handle: string;
  handle?: string;
  mailbox_override?: string;
}

export interface InspectRoutingResult {
  status: "ok" | "warning" | "error";
  project_handle: string;
  handle: string;
  resolved_project_path: string;
  resolved_roster_path: string;
  resolved_mailbox_path: string;
  routing_scope: "project" | "common" | "global" | "override";
  warnings: string[];
  errors: string[];
}

export interface ValidateConfigInput {
  project_handle?: string;
  include_common?: boolean;
}

export interface ValidateConfigResult {
  status: "ok" | "warning" | "error";
  checks: CheckResult[];
  warnings: string[];
  errors: string[];
}
