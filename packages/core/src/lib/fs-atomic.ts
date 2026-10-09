import fs from "fs";
import path from "path";

const TMP_FILE_TTL_MS = 60 * 60 * 1000;

export function writeFileAtomic(filePath: string, content: string): void {
  const targetDir = path.dirname(filePath);
  const tmpDir = path.join(targetDir, "tmp");
  const tmpPath = path.join(
    tmpDir,
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  cleanupStaleTmpFiles(tmpDir);

  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (error) {
      // EXDEV: rename across filesystems fails. Fall back to copy + unlink
      // so the atomic write still completes on cross-device targets.
      if (isCrossDeviceError(error)) {
        fs.copyFileSync(tmpPath, filePath);
        fs.unlinkSync(tmpPath);
      } else {
        throw error;
      }
    }
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

function isCrossDeviceError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "EXDEV"
  );
}

function cleanupStaleTmpFiles(tmpDir: string): void {
  try {
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      if (!entry.endsWith(".tmp")) {
        continue;
      }

      const entryPath = path.join(tmpDir, entry);
      const stats = fs.statSync(entryPath);
      if (Date.now() - stats.mtimeMs <= TMP_FILE_TTL_MS) {
        continue;
      }

      fs.unlinkSync(entryPath);
    }
  } catch {
    // Cleanup is best effort and must not block the actual atomic write.
  }
}
