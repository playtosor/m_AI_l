import { tool } from "@opencode-ai/plugin";
import path from "path";
import { fileURLToPath } from "url";

// V2.5 SIMPLIFY WS6 — Finding #15: import the shared `Lib` interface from
// `src/domain/types.ts` instead of redeclaring a partial / divergent copy
// here. The previously omitted `roster?` parameter on readMail and
// writeMail now matches the canonical `Lib`.
import type { Lib } from "../domain/types";
/**
 * Coerces the mailbox tool's `no_archive` argument to a boolean.
 * Inlined (not imported from ./no-archive) because mailbox.ts is copied
 * verbatim to ~/.config/opencode/tools/ for the OpenCode plugin runtime,
 * without its sibling modules — a runtime import would fail to resolve
 * and crash OpenCode on load. Keep in sync with packages/core/src/tools/no-archive.ts.
 */
function coerceNoArchive(value: unknown): boolean {
  return String(value) === "true";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Action = "mail" | "send" | "register";

interface MailboxInput {
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

interface MailboxResult {
  success: boolean;
  output?: string;
  error?: string;
}

function libPath(): string {
  const p = process.env.MAILBOX_LIBRARY_PATH;
  if (!p) {
    throw new Error(
      "[mailbox] MAILBOX_LIBRARY_PATH is required. Set it to the absolute path " +
      "of the compiled packages/core/dist/index.js in your m_AI_l clone. " +
      "Example (Windows): set MAILBOX_LIBRARY_PATH=C:\\path\\to\\m_AI_l\\packages\\core\\dist\\index.js"
    );
  }
  return p;
}

/**
 * S2: validate that MAILBOX_LIBRARY_PATH resolves to a file that looks like
 * a compiled m_AI_l barrel. Since the plugin is distributed publicly and
 * no hardcoded local path is safe, we drop the projectRoot anchor (which
 * required a canonical local path) and instead require the path to end
 * with `<sep>dist<sep>index.js`. This prevents loading arbitrary `.js`
 * files while remaining agnostic to where the user cloned m_AI_l.
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
      `Point it at the compiled barrel in your m_AI_l clone.`
    );
  }
}

async function loadLibAndCore(): Promise<{ lib: Lib; mailboxWithLib: (lib: Lib, input: MailboxInput) => MailboxResult }> {
  const p = libPath();
  // S2: enforce dist/ restriction before any dynamic import.
  assertLibraryPathWithinDist(p);
  try {
    const mod = await import("file:///" + p.replace(/\\/g, "/"));
    const lib = (mod.default || mod) as unknown as Lib;
    const mailboxWithLib = (mod.mailboxWithLib || mod.default?.mailboxWithLib) as (lib: Lib, input: MailboxInput) => MailboxResult;
    if (!mailboxWithLib) {
      throw new Error("mailboxWithLib not exported from library");
    }
    return { lib, mailboxWithLib };
  } catch (e: any) {
    throw new Error("[mailbox] Failed to load library: " + p + " — " + (e.message ?? e) + ". Override via MAILBOX_LIBRARY_PATH.");
  }
}

export default tool({
  description: "Read messages, send a message, or register a handle in a project mailbox. Never guess project_handle: always ask explicitly.",
  args: {
    action: tool.schema.string().optional().describe("mail|send|register"),
    project_handle: tool.schema.string().optional().describe("Project handle (required)"),
    handle: tool.schema.string().optional().describe("Target handle for mail/register"),
    sender: tool.schema.string().optional().describe("Sender for send (default: TRANSIENT_SENDER)"),
    recipient: tool.schema.string().optional().describe("Recipient for send"),
    subject: tool.schema.string().optional().describe("Message subject for send"),
    body: tool.schema.string().optional().describe("Message body for send"),
    role: tool.schema.string().optional().describe("Role for register"),
    mailbox: tool.schema.string().optional().describe("Mailbox path (optional, register)"),
    status: tool.schema.string().optional().describe("Status for register (default: active)"),
    no_archive: tool.schema.string().optional().describe("true to read without archiving (peek)"),
    limit: tool.schema.number().optional().describe("Max messages to read"),
  },
  async execute(args, _context) {
    const action = (args.action || "") as Action;
    let lib: Lib;
    let mailboxWithLib: (lib: Lib, input: MailboxInput) => MailboxResult;
    try {
      const loaded = await loadLibAndCore();
      lib = loaded.lib;
      mailboxWithLib = loaded.mailboxWithLib;
    } catch (e: any) {
      return "ERROR mailbox: " + (e.message ?? String(e));
    }

    const input: MailboxInput = {
      action,
      project_handle: args.project_handle as string | undefined,
      handle: args.handle as string | undefined,
      sender: args.sender as string | undefined,
      recipient: args.recipient as string | undefined,
      subject: args.subject as string | undefined,
      body: args.body as string | undefined,
      role: args.role as string | undefined,
      mailbox: args.mailbox as string | undefined,
      status: args.status as string | undefined,
      no_archive: coerceNoArchive(args.no_archive),
      limit: args.limit as number | undefined,
    };

    const result = mailboxWithLib(lib, input);
    if (result.success) {
      return result.output;
    }
    return "ERROR mailbox: " + result.error;
  },
});
