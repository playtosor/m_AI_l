function readEnvPath(name: string, fallback: string): string {
 const value = process.env[name]?.trim();
 if (value && value.length > 0) return value;
 console.warn(`[m_AI_l] Env var ${name} not set — using fallback: ${fallback}`);
 return fallback;
}

export const PROJECT_ROOT = readEnvPath("PROJECT_ROOT", "C:\\dev\\m_AI_l_EXPORT");
export const COMMON_ROOT = readEnvPath("COMMON_PATH", "C:\\dev\\common");
export const SENTINEL = "<!-- END -->";
export const ROSTER_FILE = "roster.md";
export const PROJECTS_FILE = "projects_config.md";

/**
 * V3.0 BAC 2A follow-up: canonical roster header (markdown table header +
 * separator row). Shared by every site that creates a new roster file
 * (upsert-handle, addRosterEntry, create-project, bootstrap-common).
 * Extracted to eliminate the 15+ duplicated magic strings across the
 * codebase.
 */
export const ROSTER_HEADER = "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n";

/**
 * V3.0 BAC 2A follow-up: default status for a newly created roster entry.
 * Used by upsert-handle and init-mail instead of the bare "active" literal.
 */
export const DEFAULT_ROSTER_STATUS = "active";

export const MESSAGE_FORMAT = "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body";
export const TRANSIENT_SENDER = "TRANSIENT";
export const PRIORITY_MEDIUM: "H" | "M" | "L" = "M";

// V2.10: canonical HUMAN handle identifier. Magic string removed from 60+ sites;
// literal types (e.g. `{ handle: "HUMAN" }` discriminated unions) still use the
// bare string so the type stays narrow without a circular type reference.
export const HUMAN_HANDLE = "HUMAN" as const;

/**
 * V3.0 BAC 2A — S1/S11: global allowlist for post-create-hook command paths.
 *
 * The hook executes an arbitrary binary (e.g. `node`, `bash`, custom
 * scripts). Without an allowlist, a misconfigured `command_path` lets the
 * MCP operator run arbitrary binaries under the project's identity —
 * typically a RCE vector. Entries are matched by absolute file basename
 * (e.g. "node", "bash"), normalised to lowercase.
 *
 * Operators add to this list via environment variable
 * `M_AI_L_POST_CREATE_HOOK_ALLOWLIST` (comma-separated basenames) BEFORE
 * the MCP server starts. No runtime mutation: changing the allowlist
 * requires a server restart.
 */
export const POST_CREATE_HOOK_ALLOWLIST: readonly string[] = (
  process.env.M_AI_L_POST_CREATE_HOOK_ALLOWLIST
    ?.split(",")
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0) ?? ["node", "bash", "cmd", "pwsh", "sh"]
); // sensible built-in defaults

/**
 * V3.0 BAC 2A — S11: environment-variable allowlist forwarded to the hook.
 *
 * `process.env` contains secrets (API keys, tokens) and platform-specific
 * paths. Spreading it wholesale into a child process leaks those secrets
 * to any script invoked by the hook. The hook child env is built ONLY
 * from these keys, looked up in the parent process env at spawn time.
 *
 * Defaults are conservative: the minimum a hook typically needs.
 */
export const POST_CREATE_HOOK_ENV_ALLOWLIST: readonly string[] = (
  process.env.M_AI_L_POST_CREATE_HOOK_ENV_ALLOWLIST
    ?.split(",")
    .map(name => name.trim())
    .filter(name => name.length > 0) ?? [
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "LANG",
  "LC_ALL",
]
);

export function getCommonRoot(): string {
 const value = process.env.COMMON_PATH?.trim();
 if (value && value.length > 0) return value;
 console.warn(`[m_AI_l] Env var COMMON_PATH not set — using fallback: C:\\dev\\common`);
 return "C:\\dev\\common";
}
