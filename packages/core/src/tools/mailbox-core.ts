import { PRIORITY_MEDIUM, TRANSIENT_SENDER } from "../domain/constants";
import { FileOperationError, MailboxNotFoundError, ProjectNotFoundError } from "../domain/errors";
import type { RosterEntry, Lib as DomainLib, MailboxSnapshot } from "../domain/types";
import { normalizeHandle, parseQualifiedHandle } from "../lib/handles";

// ---------------------------------------------------------------------------
// Internal types (no dependency on library types)
// ---------------------------------------------------------------------------

type Roster = RosterEntry[];

/**
 * V2.5 SIMPLIFY WS6 — Finding #15: re-export the canonical `Lib` and
 * `MailboxSnapshot` from `src/domain/types.ts` so existing importers
 * (`src/index.ts` re-exports `Lib` from this file) continue to work
 * unchanged. The local declarations have been removed — both
 * tools/mailbox-core.ts and tools/mailbox.ts now share the single
 * domain-level interface.
 */
export type Lib = DomainLib;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MailboxInput {
  action: "mail" | "send" | "register";
  project_handle?: string;
  handle?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  role?: string;
  mailbox?: string;
  status?: string;
  no_archive?: boolean;
  limit?: number;
}

export type MailboxResult =
  | { success: true; output: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Core logic (pure, testable via injected lib)
// ---------------------------------------------------------------------------

export function mailboxWithLib(lib: Lib, input: MailboxInput): MailboxResult {
  switch (input.action) {
    case "mail":
      return handleMail(lib, input);
    case "send":
      return handleSend(lib, input);
    case "register":
      return handleRegister(lib, input);
    default:
      return { success: false, error: "Unknown action: " + input.action };
  }
}

function getProjectsWithFallback(lib: Lib): string {
  try {
    return lib.getProjects().map((p) => p.name).join(", ");
  } catch {
    return "(unable to load list)";
  }
}

function getRosterWithErrorHandling(lib: Lib, projectHandle: string): Roster | MailboxResult {
  try {
    return lib.getRoster(projectHandle);
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return {
        success: false,
        error: "Project not found: " + projectHandle + ". Available projects: " + getProjectsWithFallback(lib),
      };
    }
    if (e instanceof FileOperationError) {
      return {
        success: false,
        error: "Project " + projectHandle + " not registered in projects_config.md. Add it or check .messaging-config.json",
      };
    }
    return { success: false, error: "Project error: " + formatError(e) };
  }
}

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function handleMail(lib: Lib, input: MailboxInput): MailboxResult {
  const { project_handle, handle } = input;

  if (!project_handle) return { success: false, error: "Missing required field: project_handle" };
  if (!handle) return { success: false, error: "Missing required field: handle" };

  const rosterOrError = getRosterWithErrorHandling(lib, project_handle);
  if (!Array.isArray(rosterOrError)) return rosterOrError;

  // Accept "PROJECTHANDLE/HANDLE" qualified form so callers that pass a
  // fully-qualified handle (typical cross-project senders) can also read
  // their mailbox with the same syntax. The bare handle is what we look
  // up in the current project's roster.
  const qualified = parseQualifiedHandle(handle);
  const bareHandle = qualified.handle;
  if (!bareHandle) return { success: false, error: "Missing required field: handle" };

  const knownHandles = new Set(rosterOrError.map((e) => normalizeHandle(e.handle)));
  if (!knownHandles.has(bareHandle)) {
    const knownList = rosterOrError.map((e) => e.handle).join(", ");
    return { success: false, error: "Unknown handle: " + handle + " in " + project_handle + ". Known handles: " + knownList };
  }

  let snapshot: MailboxSnapshot;
  try {
    const options: { noArchive?: boolean; limit?: number; roster?: Roster } = { roster: rosterOrError };
    if (input.no_archive) options.noArchive = true;
    if (input.limit !== undefined) options.limit = input.limit;
    // Pass the bare handle to readMail so it resolves the correct
    // mailbox file; keep the original `handle` (possibly qualified) in
    // the user-facing echo to mirror the caller's input.
    snapshot = lib.readMail(project_handle, bareHandle, options);
  } catch (e) {
    if (e instanceof MailboxNotFoundError || e instanceof FileOperationError) {
      return {
        success: false,
        error: "Mailbox not found for " + handle + " in " + project_handle + ". Check roster.md for handle " + bareHandle + " in project " + project_handle,
      };
    }
    return { success: false, error: "Mailbox read error for " + handle + " in " + project_handle + ": " + formatError(e) };
  }

  if (snapshot.messages.length === 0) {
    return { success: true, output: "No messages in " + project_handle + " (" + handle + ")." };
  }

  const formatted = snapshot.messages
    .map((m) => "[" + m.timestamp + "] " + m.sender + " (" + m.priority + ") " + m.subject + "\n" + m.body)
    .join("\n---\n");

  // Surface parse diagnostics the agent would otherwise miss (unlike MCP
  // read_mail which reports invalid_count/warning_count). Additive suffix
  // (SIMPLIFY critical-feedback #15).
  const diagnostics = " (invalid_lines: " + snapshot.invalid_lines.length + ", warning_count: " + snapshot.warning_count + ")";

  return {
    success: true,
    output: "=== Mailbox for " + handle + " in " + project_handle + " ===\n" + formatted + diagnostics,
  };
}

function handleSend(lib: Lib, input: MailboxInput): MailboxResult {
  const { project_handle, recipient, subject, body, sender } = input;

  if (!project_handle) return { success: false, error: "Missing required field: project_handle" };
  if (!recipient) return { success: false, error: "Missing required field: recipient" };
  if (!subject) return { success: false, error: "Missing required field: subject" };
  if (!body) return { success: false, error: "Missing required field: body" };

  const rosterOrError = getRosterWithErrorHandling(lib, project_handle);
  if (!Array.isArray(rosterOrError)) return rosterOrError;

  const knownHandles = new Set(rosterOrError.map((e) => normalizeHandle(e.handle)));

  // Accept "PROJECTHANDLE/HANDLE" qualified form for the recipient; the
  // bare handle is what we look up in the current project's roster.
  const qualifiedRecipient = parseQualifiedHandle(recipient);
  const bareRecipient = qualifiedRecipient.handle;
  if (!bareRecipient) {
    return { success: false, error: "Missing required field: recipient" };
  }
  if (!knownHandles.has(bareRecipient)) {
    const knownList = rosterOrError.map((e) => e.handle).join(", ");
    return { success: false, error: "Unknown recipient: " + recipient + " in " + project_handle + ". Known handles: " + knownList };
  }

  const trimmedSender = sender?.trim();
  const effectiveSender = trimmedSender || TRANSIENT_SENDER;
  const warnings: string[] = [];

  // Parse the optional "PROJECTHANDLE/HANDLE" prefix on the sender so we
  // can: (a) match the bare handle against the roster like the recipient
  // does, and (b) forward the origin project to writeMail so it can stamp
  // messages with the qualified sender label.
  const qualifiedSender = trimmedSender ? parseQualifiedHandle(trimmedSender) : undefined;
  const bareSender = qualifiedSender?.handle ?? "";
  const senderProjectHandle = qualifiedSender?.project;

  if (!trimmedSender) {
    warnings.push("sender absent, " + TRANSIENT_SENDER + " used");
  } else if (!bareSender || !knownHandles.has(bareSender)) {
    warnings.push("sender " + trimmedSender + " not registered in this project, message delivered without outbox");
  }

  try {
    const writeResult = lib.writeMail(
      project_handle,
      effectiveSender,
      bareRecipient,
      PRIORITY_MEDIUM,
      subject,
      body,
      undefined,
      senderProjectHandle,
      rosterOrError
    );
    if (writeResult.outboxWriteFailed) {
      warnings.push("message delivered but sender outbox write failed; not recorded in outbox");
    }
  } catch (e) {
    return { success: false, error: "Send error: " + formatError(e) };
  }

  let output = "Sent to " + recipient + " in " + project_handle + ".";
  if (warnings.length > 0) {
    output += " Warning: " + warnings.join(". ") + ".";
  }

  return { success: true, output };
}

function handleRegister(lib: Lib, input: MailboxInput): MailboxResult {
  const { project_handle, handle, role, mailbox, status } = input;

  if (!project_handle) return { success: false, error: "Missing required field: project_handle" };
  if (!handle) return { success: false, error: "Missing required field: handle" };
  if (!role) return { success: false, error: "Missing required field: role" };

  let result: { status: string; project_handle: string; handle: string; role: string; mailbox: string; roster_status: string };
  try {
    result = lib.upsertHandle({ project_handle, handle, role, mailbox, status });
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return {
        success: false,
        error: "Project not found: " + project_handle + ". Available projects: " + getProjectsWithFallback(lib),
      };
    }
    if (e instanceof FileOperationError) {
      return {
        success: false,
        error: "Project " + project_handle + " not registered in projects_config.md. Add it or check .messaging-config.json",
      };
    }
    return { success: false, error: "Registration error: " + formatError(e) };
  }

  if (result.status === "created") {
    return {
      success: true,
      output: "Handle " + handle + " created in " + project_handle + " (role: " + result.role + ", mailbox: " + result.mailbox + ").",
    };
  }

  return {
    success: true,
    output: "Handle " + handle + " updated in " + project_handle + " (role: " + result.role + ", mailbox: " + result.mailbox + ").",
  };
}
