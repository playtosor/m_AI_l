import fs from "fs";
import os from "os";
import path from "path";
import { ConfigCorruptionError } from "../domain/errors";

/**
 * Home-level m_AI_l configuration, stored at a fixed location independent of
 * COMMON_PATH itself (breaks the chicken-and-egg of bootstrapping COMMON_PATH
 * from a config that lives inside COMMON_ROOT).
 *
 * Shape:
 *   { "commonPath": "<abs>", "projectRoot": "<abs, optional>" }
 */
export interface HomeConfig {
  commonPath?: string;
  projectRoot?: string;
}

/**
 * Read `~/.m_ai_l/config.json`.
 *
 * Missing file → `{}` (not configured, caller falls through the chain).
 * Present-but-corrupt → ConfigCorruptionError (precedent: config-persistence).
 * Never silently ignored (D7).
 *
 * Concurrency: single-threaded, lock-free read of a small JSON file. No
 * TOCTOU protection between existsSync and readFileSync — a mid-read delete
 * surfaces as a ConfigCorruptionError, which is acceptable for a
 * human-edited config file.
 */
export function readHomeConfig(): HomeConfig {
  const configPath = path.join(os.homedir(), ".m_ai_l", "config.json");
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Home config must be a JSON object");
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.commonPath !== undefined && typeof obj.commonPath !== "string") {
      throw new Error(`Home config commonPath must be a string, got ${typeof obj.commonPath}`);
    }
    if (obj.projectRoot !== undefined && typeof obj.projectRoot !== "string") {
      throw new Error(`Home config projectRoot must be a string, got ${typeof obj.projectRoot}`);
    }
    const config: HomeConfig = {};
    if (typeof obj.commonPath === "string") config.commonPath = obj.commonPath;
    if (typeof obj.projectRoot === "string") config.projectRoot = obj.projectRoot;
    return config;
  } catch (error) {
    throw new ConfigCorruptionError(`Corrupt home config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
