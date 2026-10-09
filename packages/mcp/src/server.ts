#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import * as path from "path";
import { assertValidHandleSyntax, HANDLE_SYNTAX_RE } from "@m_ai_l/core";

// V3.0 BAC 2A — S10: bounded-length user-content fields to prevent
// accidental or malicious DoS via huge payloads. Handles/roles have their
// own canonical regex (S5) so they don't need .max() here.
const MAX_SUBJECT_LEN = 512;
const MAX_BODY_LEN = 64 * 1024;
const SubjectSchema = z.string().min(1).max(MAX_SUBJECT_LEN);
const BodySchema = z.string().min(1).max(MAX_BODY_LEN);

// V2.5 SIMPLIFY WS3 finding #11: MCP tool gate. Reject any handle input
// (project_handle, handle, target_handle, sender, recipient, etc.) that
// doesn't match `^[A-Za-z0-9_]{1,63}$`. Catches path-traversal attempts
// like `../../AGENT` or `foo;bar` at the API boundary BEFORE they reach
// services. Backed by `assertValidHandleSyntax` from lib/handles (single
// source of truth — the regex is exported so Zod's refine shares it).
const HandleSyntaxSchema = z.string().regex(HANDLE_SYNTAX_RE, "Invalid handle syntax: expected [A-Za-z0-9_]{1,63}");
const SenderFieldSchema = HandleSyntaxSchema;
const RecipientFieldSchema = HandleSyntaxSchema;
const OptionalHandleSyntaxSchema = HandleSyntaxSchema.optional();
function assertValidHandles(record: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (record[field] !== undefined) {
      assertValidHandleSyntax(record[field] as string);
    }
  }
}

import {
  readMail, writeMail, cancelMail, editMail, archiveMail, initMail,
  getProjects, getRoster, getOutbox, getMemberContext, handoverSelf,
  resolveHandleCandidates, readRecentArchive,
} from "@m_ai_l/core";

function toJsonContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

function toErrorMessage(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : "Unknown error");
}

// Read version from package.json so it stays in sync with releases.
const packageJson = require(path.resolve(__dirname, "..", "package.json")) as { version: string };

const server = new McpServer({
  name: "mcp-server-messaging",
  version: packageJson.version,
});

server.registerTool(
  "read_mail",
  {
    description: "Read messages from a mailbox and archive them by default. Use limit=1 to read only the oldest message.",
  inputSchema: {
    project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
    handle: HandleSyntaxSchema.describe("Mailbox owner handle, for example AGENT1."),
    limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe(
      "Maximum number of messages to read and archive. If omitted, reads all messages."
    ),
    no_archive: z.boolean().optional().describe("If true, read without archiving."),
  },
},
async ({ project_handle, handle, limit, no_archive }) => {
  try {
    const snapshot = readMail(project_handle, handle, {
      limit,
      noArchive: no_archive,
      mailboxOverride: undefined,
    });
      return toJsonContent({
        project_handle,
        handle,
        count: snapshot.messages.length,
        messages: snapshot.messages,
        invalid_count: snapshot.invalid_lines.length,
        warning_count: snapshot.warning_count,
        archived: !(no_archive ?? false) && snapshot.messages.length > 0,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "read_recent_archive",
  {
    description: "Read the most recent archived messages for a handle using the best available project context.",
    inputSchema: {
    handle: HandleSyntaxSchema.describe("Mailbox owner handle."),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of archived messages to return. Defaults to 1."),
      current_project_handle: z
        .string()
        .min(1)
        .optional()
        .describe("Optional current project handle when already known."),
      cwd: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Optional working directory used to infer the current project when no project handle is provided."
        ),
    },
  },
  async ({ handle, limit, current_project_handle, cwd }) => {
    try {
      const result = readRecentArchive(handle, limit ?? 1, current_project_handle, cwd);
      return toJsonContent(result);
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "write_mail",
  {
    description: "Write a message to a recipient mailbox and log it in the sender outbox. Subject must not contain ' // ' — the sequence is normalized to ' ∕∕ ' on write.",
  inputSchema: {
    project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
    sender: SenderFieldSchema.describe("Sender handle."),
    recipient: RecipientFieldSchema.describe("Recipient handle."),
    priority: z.enum(["H", "M", "L"]).describe("Message priority."),
    subject: SubjectSchema.describe("Short message subject."),
    body: BodySchema.describe("Message body."),
    sender_project_handle: z
    .string()
    .min(1)
    .optional()
    .describe("Origin project handle for inter-project message signing. When different from project_handle, sender becomes ORIGIN/HANDLE."),
  },
},
async ({ project_handle, sender, recipient, priority, subject, body, sender_project_handle }) => {
  try {
    const writeResult = writeMail(project_handle, sender, recipient, priority, subject, body, undefined, sender_project_handle);
      return toJsonContent({
        status: "sent",
        effective_sender: writeResult.effectiveSender,
        ...(writeResult.outboxWriteFailed
          ? { outbox_warning: "message delivered but sender outbox write failed; not recorded in outbox" }
          : {}),
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "cancel_mail",
  {
    description: "Cancel a message if it is still present in the active recipient mailbox.",
  inputSchema: {
    project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
    sender: HandleSyntaxSchema.describe("Original sender handle."),
    recipient: HandleSyntaxSchema.describe("Original recipient handle."),
    timestamp: z
    .string()
    .min(1)
    .describe("Original message timestamp in YYYYMMDD-HHMM format."),
    subject: z.string().min(1).describe("Original message subject."),
    sender_project_handle: z
    .string()
    .min(1)
    .optional()
    .describe("Origin project handle for inter-project message signing. Used to compute the effective sender stored in the message."),
  },
},
async ({ project_handle, sender, recipient, timestamp, subject, sender_project_handle }) => {
  try {
    const removed = cancelMail(
      project_handle, sender, recipient, timestamp, subject, undefined, sender_project_handle
    );
      return toJsonContent({
        status: "cancelled",
        project_handle,
        recipient,
        removed,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "edit_mail",
  {
    description: "Edit an unread active message in place, or send a correction message if it has already been read. Subject must not contain ' // ' — the sequence is normalized to ' ∕∕ ' on write.",
  inputSchema: {
    project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
    sender: HandleSyntaxSchema.describe("Original sender handle."),
    recipient: HandleSyntaxSchema.describe("Original recipient handle."),
    timestamp: z
    .string()
    .min(1)
    .describe("Original message timestamp in YYYYMMDD-HHMM format."),
    subject: z.string().min(1).describe("Original message subject."),
    new_priority: z.enum(["H", "M", "L"]).optional().describe("Replacement priority."),
    new_subject: SubjectSchema.optional().describe("Replacement subject."),
    new_body: BodySchema.optional().describe("Replacement body."),
    sender_project_handle: z
    .string()
    .min(1)
    .optional()
    .describe("Origin project handle for inter-project message signing. Used to compute the effective sender stored in the message."),
  },
},
async ({ project_handle, sender, recipient, timestamp, subject, new_priority, new_subject, new_body, sender_project_handle, }) => {
  try {
    const result = editMail(
      project_handle, sender, recipient, timestamp, subject,
      { priority: new_priority, subject: new_subject, body: new_body },
      undefined, sender_project_handle
    );
      return toJsonContent({
        status: result.mode,
        project_handle,
        recipient,
        previous: result.previous,
        message: result.message,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "get_projects",
  {
    description: "Return the project list parsed from projects_config.md.",
  },
  async () => {
    try {
      const projects = getProjects();
      return toJsonContent({
        count: projects.length,
        projects,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "get_roster",
  {
    description: "Return the roster entries for a specific project.",
    inputSchema: {
      project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
    },
  },
  async ({ project_handle }) => {
    try {
      const roster = getRoster(project_handle);
      return toJsonContent({
        project_handle,
        count: roster.length,
        roster,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "resolve_handle_candidates",
  {
    description: "Resolve a recipient handle by searching the current project first, then COMMON, then all active projects.",
    inputSchema: {
      target_handle: HandleSyntaxSchema.describe("Handle to resolve."),
      current_project_handle: z
        .string()
        .min(1)
        .optional()
        .describe("Optional current project handle when already known."),
      cwd: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Optional working directory used to infer the current project when no project handle is provided."
        ),
    },
  },
  async ({ target_handle, current_project_handle, cwd }) => {
    try {
      const result = resolveHandleCandidates(target_handle, current_project_handle, cwd);
      return toJsonContent(result);
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "get_member_context",
  {
    description: "Return project and routing context for a specific roster member.",
    inputSchema: {
      project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
      handle: HandleSyntaxSchema.describe("Member handle to inspect."),
    },
  },
  async ({ project_handle, handle }) => {
    try {
      const context = getMemberContext(project_handle, handle);
      return toJsonContent(context);
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "init_mail",
  {
    description: "Initialize mailbox, archive, outbox, and roster entry for a handle.",
    inputSchema: {
      project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
      handle: HandleSyntaxSchema.describe("New member handle."),
      role: z.string().min(1).describe("Role description for the roster entry."),
      mailbox: z
        .string()
        .min(1)
        .refine((v) => !v.includes(".."), "mailbox path cannot contain '..' segments")
        .optional()
        .describe("Roster mailbox path. Defaults to mailbox_<HANDLE>.md."),
      status: z.string().min(1).optional().describe("Roster status. Defaults to active."),
    },
  },
  async ({ project_handle, handle, role, mailbox, status }) => {
    try {
      const mailboxPath = mailbox ?? `mailbox_${handle}.md`;
      initMail(project_handle, handle, role, mailboxPath, status ?? "active");
      return toJsonContent({
        status: "initialized",
        project_handle,
        handle,
        role,
        mailbox: mailboxPath,
        rosterStatus: status ?? "active",
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "handover_self",
  {
    description: "Write a standard high-priority Handover message to the same handle for renewal workflows.",
    inputSchema: {
      project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
      handle: HandleSyntaxSchema.describe("Handle that should receive the handover."),
      body: BodySchema.describe("Handover body."),
      sender: z
        .string()
        .min(1)
        .optional()
        .describe("Optional sender handle when writing on behalf of the renewed thread."),
    },
  },
  async ({ project_handle, handle, body, sender }) => {
    try {
      const result = handoverSelf(project_handle, handle, body, sender);
      return toJsonContent({
        status: "sent",
        project_handle,
        ...result,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "archive_mail",
  {
    description: "Archive the current mailbox content and reset the mailbox to sentinel only.",
  inputSchema: {
    project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
    handle: HandleSyntaxSchema.describe("Mailbox owner handle."),
  },
},
async ({ project_handle, handle }) => {
  try {
    archiveMail(project_handle, handle, undefined);
      return toJsonContent({
        status: "archived",
        project_handle,
        handle,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

server.registerTool(
  "get_outbox",
  {
    description: "Return the outbox entries for a given handle.",
    inputSchema: {
      project_handle: HandleSyntaxSchema.describe("Project handle from projects_config.md."),
      handle: HandleSyntaxSchema.describe("Outbox owner handle."),
    },
  },
  async ({ project_handle, handle }) => {
    try {
      const outbox = getOutbox(project_handle, handle);
      return toJsonContent({
        project_handle,
        handle,
        count: outbox.length,
        outbox,
      });
    } catch (error) {
      throw toErrorMessage(error);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP messaging server connected over stdio.");
}

/** Public MCP surface — message lifecycle only.
Exposed: read_mail, write_mail, cancel_mail, edit_mail, archive_mail.
Registered but NOT listed (CLI/skills-only by design): read_recent_archive,
get_projects, get_roster, resolve_handle_candidates, get_member_context,
init_mail, handover_self, get_outbox. Keep both lists in sync with the
registerTool() calls above. */
export function listTools(): string[] {
return [
"read_mail",
"write_mail",
"cancel_mail",
"edit_mail",
"archive_mail",
];
}

main().catch(error => {
console.error("MCP server failed to start:", error);
process.exit(1);
});
