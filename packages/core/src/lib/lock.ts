import { LockAcquisitionError } from "../domain/errors";
import fs from "fs";

const LOCK_TTL_MS = 10 * 60 * 1000;
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_RETRY_COUNT = 20;

/**
 * Acquires a file-based lock, executes the callback, then releases the lock.
 *
 * ⚠ Busy-wait limitation: The retry loop in `acquireLock` uses a synchronous
 * spinlock (`sleep` spins on `Date.now()`). This blocks the Node.js event loop
 * for up to ~1 s (LOCK_RETRY_COUNT × LOCK_RETRY_DELAY_MS). Acceptable for
 * short-lived CLI / MCP tool calls, but NOT suitable for server contexts or
 * any code that must remain responsive during contention.
 */
export function withFileLock<T>(targetPath: string, operation: string, callback: () => T): T {
  const lockPath = `${targetPath}.lock`;
  acquireLock(lockPath, operation);

  try {
    return callback();
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * Acquires file locks for multiple target paths, runs the callback, then
 * releases every lock. Paths are sorted before acquisition so concurrent
 * admin operations (delete/rename handle) always lock in a consistent
 * order — avoiding deadlocks. Locks are released LIFO (last acquired first)
 * so a partially-acquired set is always unwound cleanly on error.
 *
 * `acquireLock`/`releaseLock` are private to this module and called directly.
 */
export function withMultiLock<T>(targetPaths: string[], operation: string, callback: () => T): T {
  const sorted = targetPaths.slice().sort();
  const acquired: string[] = [];
  try {
    for (const p of sorted) {
      const lockPath = `${p}.lock`;
      acquireLock(lockPath, operation);
      acquired.push(lockPath);
    }
    return callback();
  } finally {
    for (let i = acquired.length - 1; i >= 0; i -= 1) releaseLock(acquired[i]);
  }
}

function acquireLock(lockPath: string, operation: string): void {
  for (let attempt = 0; attempt <= LOCK_RETRY_COUNT; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      const payload = JSON.stringify({
        operation,
        acquired_at: new Date().toISOString(),
        pid: process.pid,
      });
      fs.writeFileSync(fd, payload, "utf-8");
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      if (isStaleLock(lockPath)) {
        fs.unlinkSync(lockPath);
        continue;
      }

      if (attempt === LOCK_RETRY_COUNT) {
        throw new LockAcquisitionError(`Could not acquire lock for ${lockPath}.`);
      }

      sleep(LOCK_RETRY_DELAY_MS);
    }
  }
}

function releaseLock(lockPath: string): void {
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

function isStaleLock(lockPath: string): boolean {
  try {
    const stats = fs.statSync(lockPath);
    return Date.now() - stats.mtimeMs > LOCK_TTL_MS;
  } catch (error) {
    console.warn(`[m_AI_l] Could not check lock staleness for ${lockPath}:`, error);
    return false;
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return error.code === "EEXIST";
}

function sleep(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // Intentional short synchronous wait for a simple local lock strategy.
  }
}
