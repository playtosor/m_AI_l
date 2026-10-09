import fs from "fs";
import path from "path";
import { COMMON_ROOT } from "../domain/constants";
import {
  ProjectMessagingConfig,
  GlobalMessagingConfig,
  PostCreateHookConfig,
} from "../domain/types";
import { ConfigCorruptionError } from "../domain/errors";
import { writeFileAtomic } from "./fs-atomic";

// ============================================================================
// Configuration persistence layer for messaging core library
// ============================================================================

const PROJECT_CONFIG_FILE = ".messaging-config.json";
const GLOBAL_CONFIG_FILE = ".messaging-global-config.json";

// ---------------------------------------------------------------------------
// Schema validation helpers
// ---------------------------------------------------------------------------

function validateProjectConfig(raw: unknown): ProjectMessagingConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Project config must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  return obj as ProjectMessagingConfig;
}

function validateGlobalConfig(raw: unknown): GlobalMessagingConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Global config must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  if ("post_create_hook" in obj && obj.post_create_hook !== undefined) {
    const hook = obj.post_create_hook;
    if (typeof hook !== "object" || hook === null || Array.isArray(hook)) {
      throw new Error("Global config post_create_hook must be an object");
    }
    const h = hook as Record<string, unknown>;
    if (typeof h.enabled !== "boolean") {
      throw new Error(`post_create_hook.enabled must be boolean, got ${typeof h.enabled}`);
    }
    if (h.mode !== "command") {
      throw new Error(`post_create_hook.mode must be "command", got ${String(h.mode)}`);
    }
    if (typeof h.command_path !== "string") {
      throw new Error(`post_create_hook.command_path must be string, got ${typeof h.command_path}`);
    }
    if (h.payload_mode !== "stdin_json") {
      throw new Error(`post_create_hook.payload_mode must be "stdin_json", got ${String(h.payload_mode)}`);
    }
  }
  return obj as GlobalMessagingConfig;
}

// ---------------------------------------------------------------------------
// Project-level configuration (entrypoint, etc.)
// ---------------------------------------------------------------------------

/**
 * Get the path to the project's messaging config file.
 * Each project stores its configuration in `.messaging-config.json` at its root.
 */
export function getProjectConfigPath(projectPath: string): string {
  return path.join(projectPath, PROJECT_CONFIG_FILE);
}

/**
 * Read the project messaging configuration.
 * Returns default empty config if file doesn't exist.
 */
export function readProjectConfig(projectPath: string): ProjectMessagingConfig {
  const configPath = getProjectConfigPath(projectPath);
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return validateProjectConfig(JSON.parse(raw));
  } catch (error) {
    // Present-but-corrupt: surface instead of silently returning {} so the
    // caller can distinguish "not configured" from "misconfigured"
    // (SIMPLIFY critical-feedback #13).
    throw new ConfigCorruptionError(`Corrupt project config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Write the project messaging configuration.
 * Creates the file if it doesn't exist.
 */
export function writeProjectConfig(
  projectPath: string,
  config: ProjectMessagingConfig
): void {
  const configPath = getProjectConfigPath(projectPath);
  writeFileAtomic(configPath, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// Global configuration (post-create hook, etc.)
// Stored in COMMON_ROOT to be shared across all projects.
// ---------------------------------------------------------------------------

/**
 * Get the path to the global messaging config file.
 */
export function getGlobalConfigPath(): string {
  return path.join(COMMON_ROOT, GLOBAL_CONFIG_FILE);
}

/**
 * Read the global messaging configuration.
 * Returns default empty config if file doesn't exist.
 */
export function readGlobalConfig(): GlobalMessagingConfig {
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return validateGlobalConfig(JSON.parse(raw));
  } catch (error) {
    // Present-but-corrupt: surface instead of silently returning {} so the
    // caller can distinguish "not configured" from "misconfigured"
    // (SIMPLIFY critical-feedback #13).
    throw new ConfigCorruptionError(`Corrupt global config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Write the global messaging configuration.
 */
export function writeGlobalConfig(config: GlobalMessagingConfig): void {
  const configPath = getGlobalConfigPath();
  writeFileAtomic(configPath, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// Post-create hook specific helpers
// ---------------------------------------------------------------------------

/**
 * Get the post-create hook configuration from global config.
 */
export function getPostCreateHookConfig(): PostCreateHookConfig | undefined {
  const globalConfig = readGlobalConfig();
  return globalConfig.post_create_hook;
}

/**
 * Set the post-create hook configuration in global config.
 */
export function setPostCreateHookConfig(
  hookConfig: PostCreateHookConfig
): void {
  // A corrupt global config is overwritten (repair), not propagated as an
  // error — the caller intends to install a known-good config.
  let globalConfig: GlobalMessagingConfig = {};
  try {
    globalConfig = readGlobalConfig();
  } catch (error) {
    if (!(error instanceof ConfigCorruptionError)) throw error;
  }
  globalConfig.post_create_hook = hookConfig;
  writeGlobalConfig(globalConfig);
}

/**
 * Remove the post-create hook configuration.
 */
export function removePostCreateHookConfig(): void {
  // A corrupt global config is overwritten (repair), not propagated as an
  // error — removing the hook is a safe, idempotent operation.
  let globalConfig: GlobalMessagingConfig = {};
  try {
    globalConfig = readGlobalConfig();
  } catch (error) {
    if (!(error instanceof ConfigCorruptionError)) throw error;
  }
  delete globalConfig.post_create_hook;
  writeGlobalConfig(globalConfig);
}
