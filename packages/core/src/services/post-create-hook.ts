import { spawnSync, ExecOptions, SpawnSyncOptions } from "child_process";
import path from "path";
import { getPostCreateHookConfig, setPostCreateHookConfig, removePostCreateHookConfig } from "../lib/config-persistence";
import { PostCreateHookStatus, RunPostCreateHookInput, RunPostCreateHookResult, PostCreateHookConfig } from "../domain/types";
import { getProject } from "../repositories/projects-repo";
import { POST_CREATE_HOOK_ALLOWLIST, POST_CREATE_HOOK_ENV_ALLOWLIST } from "../domain/constants";

/**
 * V3.0 BAC 2A — S1/S11: post-create-hook RCE hardening.
 *
 * Two complementary controls applied at every `runPostCreateHook` call:
 *
 * 1. **Command allowlist (S1)**: `command_path` must resolve to a binary
 *    whose basename is in `POST_CREATE_HOOK_ALLOWLIST` (defaults to
 *    `node`, `bash`, `cmd`, `pwsh`, `sh`; extendable via env var
 *    `M_AI_L_POST_CREATE_HOOK_ALLOWLIST`). Comparison is case-insensitive
 *    and uses the resolved basename only — arguments are not constrained.
 *
 * 2. **Environment whitelist (S11)**: the child env is built from
 *    `POST_CREATE_HOOK_ENV_ALLOWLIST` keys plus the optional `config.env`
 *    overlay (which itself is a string→string whitelist provided by the
 *    caller). `process.env` is NEVER spread — it carries API keys,
 *    pipeline tokens and platform paths that must NOT leak to the hook
 *    binary.
 *
 * The allowlist applies to runtime execution. Static configuration
 * (`configurePostCreateHook`) does NOT enforce it — the persisted config
 * is data, and operators may legitimately configure a path outside the
 * allowlist if they extend it at startup. Enforcement happens here.
 */

function getCommandBasename(commandPath: string): string {
  return path.basename(commandPath).replace(/\.(exe|bat|cmd|ps1)$/i, "").toLowerCase();
}

function isCommandAllowed(commandPath: string): boolean {
  const basename = getCommandBasename(commandPath);
  return POST_CREATE_HOOK_ALLOWLIST.includes(basename);
}

/**
 * Build a child env from the configured whitelist only. `process.env` is
 * never read directly — we read each allowlisted key from it explicitly.
 */
function buildChildEnv(overlay: Record<string, string> = {}): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};
  for (const key of POST_CREATE_HOOK_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (typeof value === "string") {
      childEnv[key] = value;
    }
  }
  for (const [key, value] of Object.entries(overlay)) {
    if (typeof value === "string") {
      childEnv[key] = value;
    }
  }
  return childEnv;
}

/**
 * Get the status of the post-create hook.
 * Returns whether a hook is configured and available.
 */
export function getPostCreateHookStatus(): PostCreateHookStatus {
  let config;
  try {
    config = getPostCreateHookConfig();
  } catch (error) {
    // Corrupt global config: report distinctly from "not configured"
    // (SIMPLIFY critical-feedback #13).
    return {
      configured: false,
      error: `corrupt global config: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!config || !config.enabled) {
    return { configured: false };
  }

  return {
    configured: true,
    mode: config.mode,
    command_path: config.command_path,
  };
}

/** @planned — per-install hook configuration; implementation in progress. Do not prune. */
/**
 * Update the post-create hook configuration.
 * Admin-only in v1.
 */
export function configurePostCreateHook(
  config: PostCreateHookConfig
): void {
  setPostCreateHookConfig(config);
}

/** @planned — per-install hook configuration; implementation in progress. Do not prune. */
/**
 * Remove the post-create hook configuration.
 */
export function clearPostCreateHook(): void {
  removePostCreateHookConfig();
}

/**
 * Run the post-create hook for a project.
 * The hook execution is separate from project creation - failure does not undo the project.
 * Runs synchronously and returns the result.
 */
export function runPostCreateHook(
  input: RunPostCreateHookInput
): RunPostCreateHookResult {
  let config;
  try {
    config = getPostCreateHookConfig();
  } catch (error) {
    // Corrupt global config: report distinctly from "not configured"
    // (SIMPLIFY critical-feedback #13).
    return {
      status: "error",
      stderr: `Post-create hook config is corrupt: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!config || !config.enabled) {
    return {
      status: "error",
      stderr: "Post-create hook is not configured or not enabled.",
    };
  }

  if (config.mode !== "command") {
    return {
      status: "error",
      stderr: `Unsupported hook mode: ${config.mode}`,
    };
  }

  const project = getProject(input.project_handle);

  // S1: enforce command allowlist BEFORE building payload / spawning.
  if (!isCommandAllowed(config.command_path)) {
    return {
      status: "error",
      stderr: `Post-create hook command_path not in allowlist: ${config.command_path} (allowed: ${POST_CREATE_HOOK_ALLOWLIST.join(", ")}). Update M_AI_L_POST_CREATE_HOOK_ALLOWLIST or remove the hook.`,
    };
  }

  // Build payload
  const payload = {
    project_handle: input.project_handle,
    project_path: input.project_path,
    trigger: input.trigger,
    requested_by: input.requested_by,
    timestamp: new Date().toISOString(),
    ...input.payload,
  };

  const payloadJson = JSON.stringify(payload, null, 2);

  // S11: child env comes from the explicit whitelist — never `process.env`.
  const execOptions: ExecOptions = {
    cwd: config.cwd || project.path,
    env: buildChildEnv(config.env ?? {}),
    timeout: config.timeout_ms || 30000,
  };

try {
    // For stdin_json mode, we write payload to stdin
    const result = execSyncWithStdin(
      config.command_path,
      config.args || [],
      payloadJson,
      execOptions
    );

    return {
      status: result.exitCode === 0 ? "success" : "error",
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error: any) {
    return {
      status: "error",
      stderr: error.message || String(error),
    };
  }
}

/**
 * Execute a command with stdin input.
 */
function execSyncWithStdin(
 command: string,
 args: string[],
 stdinData: string,
 options: ExecOptions
): { exitCode: number; stdout: string; stderr: string } {
 const spawnOptions: SpawnSyncOptions = {
 cwd: options.cwd,
 env: options.env,
 timeout: options.timeout,
 input: stdinData,
 encoding: "utf-8",
 stdio: ["pipe", "pipe", "pipe"],
 };

 const result = spawnSync(command, args, spawnOptions);

 return {
 exitCode: result.status ?? 1,
 stdout: (result.stdout as string) ?? "",
 stderr: (result.stderr as string) ?? "",
 };
}
