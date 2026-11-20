import path from "path";

// V2.5 SIMPLIFY WS6 — Finding #15: import the shared `Lib` interface from
// `src/domain/types.ts` instead of redeclaring a partial / divergent copy
// here. The previously omitted `roster?` parameter on readMail and
// writeMail now matches the canonical `Lib`.
//
// NOTE (V2 port): the import is TYPE-ONLY on purpose. This file is deployed
// verbatim into the OpenCode V2 plugin directory
// (~/.config/opencode/plugins/opencode-tools/lib/mailbox.ts), where the
// sibling `../domain/types` module does not exist. Type imports are erased at
// runtime, so the copy stays loadable without its siblings.
import type { Lib } from "../domain/types";

/**
 * Coerces the mailbox tool's `no_archive` argument to a boolean.
 * Inlined (not imported from ./no-archive) because mailbox.ts is copied
 * verbatim into the OpenCode V2 plugin runtime, without its sibling modules —
 * a runtime import would fail to resolve. Keep in sync with
 * packages/core/src/tools/no-archive.ts.
 */
export function coerceNoArchive(value: unknown): boolean {
  return String(value) === "true";
}

type Action = "mail" | "send" | "register";

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
  no_archive?: boolean | string;
  limit?: number;
}

export interface MailboxResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Fallback used when MAILBOX_LIBRARY_PATH is unset. The environment variable
 * always wins, so a clone elsewhere only needs the variable to be exported.
 */
const DEFAULT_LIBRARY_PATH = "C:/dev/m_AI_l_EXPORT/Vibe/mcp_server/packages/core/dist/index.js";

function libPath(): string {
  const p = process.env.MAILBOX_LIBRARY_PATH || DEFAULT_LIBRARY_PATH;
  if (!p) {
    throw new Error(
      "[mailbox] MAILBOX_LIBRARY_PATH is required. Set it to the absolute path " +
        "of the compiled packages/core/dist/index.js in your m_AI_l clone.",
    );
  }
  return p;
}

/**
 * S2: validate that the library path resolves to a file that looks like a
 * compiled m_AI_l barrel. Since the tool may be distributed, no hardcoded
 * local path is considered trusted: the path must end with
 * `<sep>dist<sep>index.js`.
 *
 * The resolved path must satisfy:
 *   - is absolute
 *   - ends with `.js`
 *   - ends with `<sep>dist<sep>index.js`
 */
function assertLibraryPathWithinDist(libraryPath: string): void {
  const resolved = path.resolve(libraryPath);
  if (!path.isAbsolute(resolved) || !resolved.endsWith(".js")) {
    throw new Error(`MAILBOX_LIBRARY_PATH must be an absolute path ending in .js: ${libraryPath}`);
  }
  const distIndexSuffix = `${path.sep}dist${path.sep}index.js`;
  if (!resolved.toLowerCase().endsWith(distIndexSuffix.toLowerCase())) {
    throw new Error(
      `MAILBOX_LIBRARY_PATH must end with ${distIndexSuffix} (got: ${resolved}). ` +
        `Point it at the compiled barrel in your m_AI_l clone.`,
    );
  }
}

export async function loadLibAndCore(): Promise<{
  lib: Lib;
  mailboxWithLib: (lib: Lib, input: MailboxInput) => MailboxResult;
}> {
  const p = libPath();
  // S2: enforce dist/ restriction before any dynamic import.
  assertLibraryPathWithinDist(p);
  try {
    const mod = await import("file:///" + p.replace(/\\/g, "/"));
    const lib = (mod.default || mod) as unknown as Lib;
    const mailboxWithLib = (mod.mailboxWithLib || mod.default?.mailboxWithLib) as (
      lib: Lib,
      input: MailboxInput,
    ) => MailboxResult;
    if (!mailboxWithLib) {
      throw new Error("mailboxWithLib not exported from library");
    }
    return { lib, mailboxWithLib };
  } catch (e: any) {
    throw new Error(
      "[mailbox] Failed to load library: " + p + " — " + (e.message ?? e) + ". Override via MAILBOX_LIBRARY_PATH.",
    );
  }
}

/**
 * JSON Schema of the tool input. Kept SDK-agnostic (no zod, no
 * @opencode-ai/plugin) so this file can be dropped into any runtime.
 * `no_archive` accepts a boolean or the strings "true"/"false" because the
 * mailbox triggers document `no_archive: true` while older callers send
 * "true"; both are normalised by `coerceNoArchive`.
 */
export const MAILBOX_INPUT_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["mail", "send", "register"], description: "mail | send | register" },
    project_handle: { type: "string", description: "Project handle (required)" },
    handle: { type: "string", description: "Target handle for mail/register" },
    sender: { type: "string", description: "Sender for send (default: TRANSIENT_SENDER)" },
    recipient: { type: "string", description: "Recipient for send" },
    subject: { type: "string", description: "Message subject for send" },
    body: { type: "string", description: "Message body for send" },
    role: { type: "string", description: "Role for register" },
    mailbox: { type: "string", description: "Mailbox path (optional, register)" },
    status: { type: "string", description: "Status for register (default: active)" },
    no_archive: {
      type: ["boolean", "string"],
      description: "true to read without archiving (peek)",
    },
    limit: { type: "number", description: "Max messages to read" },
  },
  additionalProperties: false,
} as const;

/**
 * Runtime-agnostic tool definition: name + description + JSON Schema input +
 * execute returning `{ content }`.
 *
 * This is the SINGLE SOURCE OF TRUTH for the OpenCode mailbox tool. The V1
 * `tool()` wrapper is gone because OpenCode V2 no longer supports
 * directory-scanned custom tools; the deployed copy is registered by
 * ~/.config/opencode/plugins/opencode-tools/index.ts.
 */
export const mailboxToolSpec = {
  name: "mailbox",
  description:
    "Read messages, send a message, or register a handle in a project mailbox. Never guess project_handle: always ask explicitly.",
  input: MAILBOX_INPUT_SCHEMA,
  execute: async (args: MailboxInput): Promise<{ content: string }> => {
    const action = (args.action || "") as Action;
    let lib: Lib;
    let mailboxWithLib: (lib: Lib, input: MailboxInput) => MailboxResult;
    try {
      const loaded = await loadLibAndCore();
      lib = loaded.lib;
      mailboxWithLib = loaded.mailboxWithLib;
    } catch (e: any) {
      return { content: "ERROR mailbox: " + (e.message ?? String(e)) };
    }

    const input: MailboxInput = {
      action,
      project_handle: args.project_handle,
      handle: args.handle,
      sender: args.sender,
      recipient: args.recipient,
      subject: args.subject,
      body: args.body,
      role: args.role,
      mailbox: args.mailbox,
      status: args.status,
      no_archive: coerceNoArchive(args.no_archive),
      limit: args.limit,
    };

    const result = mailboxWithLib(lib, input);
    if (result.success) {
      return { content: result.output ?? "" };
    }
    return { content: "ERROR mailbox: " + result.error };
  },
};

export default mailboxToolSpec;
