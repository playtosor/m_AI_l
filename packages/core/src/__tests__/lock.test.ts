import { LockAcquisitionError } from "../domain/errors";
import { withFileLock } from "../lib/lock";
import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-test-"));
const targetFile = path.join(tempDir, "mailbox_AGENT1.md");
const lockFile = `${targetFile}.lock`;

describe("lock", () => {
  beforeEach(() => {
    if (!fs.existsSync(targetFile)) {
      fs.writeFileSync(targetFile, "<!-- END -->\n");
    }

    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  });

  it("should create and release a lock around an operation", () => {
    const result = withFileLock(targetFile, "test_operation", () => {
      expect(fs.existsSync(lockFile)).toBe(true);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("should ignore a stale lock older than ten minutes", () => {
    fs.writeFileSync(lockFile, "stale");
    const staleTime = new Date(Date.now() - (11 * 60 * 1000));
    fs.utimesSync(lockFile, staleTime, staleTime);

    const result = withFileLock(targetFile, "stale_replacement", () => "recovered");

    expect(result).toBe("recovered");
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it("should fail when a fresh lock cannot be acquired", () => {
    fs.writeFileSync(lockFile, "fresh");

    expect(() => withFileLock(targetFile, "blocked", () => "never")).toThrow(LockAcquisitionError);
  });
});
