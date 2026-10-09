import { writeFileAtomic } from "../lib/fs-atomic";
import fs from "fs";
import os from "os";
import path from "path";

describe("fs-atomic", () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-atomic-test-"));
  const targetFile = path.join(projectDir, "mailbox_AGENT1.md");
  const tmpDir = path.join(projectDir, "tmp");

  beforeEach(() => {
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }

    if (fs.existsSync(tmpDir)) {
      for (const entry of fs.readdirSync(tmpDir)) {
        fs.unlinkSync(path.join(tmpDir, entry));
      }
      fs.rmdirSync(tmpDir);
    }
  });

  it("should create tmp directory on demand and write the target file", () => {
    writeFileAtomic(targetFile, "hello");

    expect(fs.readFileSync(targetFile, "utf-8")).toBe("hello");
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("should replace existing content without leaving temp files behind", () => {
    fs.writeFileSync(targetFile, "old");

    writeFileAtomic(targetFile, "new");

    expect(fs.readFileSync(targetFile, "utf-8")).toBe("new");
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("should clean stale tmp files before writing", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const staleTmp = path.join(tmpDir, "stale-file.tmp");
    const freshTmp = path.join(tmpDir, "fresh-file.tmp");
    fs.writeFileSync(staleTmp, "stale");
    fs.writeFileSync(freshTmp, "fresh");

    const staleTime = new Date(Date.now() - (61 * 60 * 1000));
    fs.utimesSync(staleTmp, staleTime, staleTime);

    writeFileAtomic(targetFile, "final");

    expect(fs.existsSync(staleTmp)).toBe(false);
    expect(fs.existsSync(freshTmp)).toBe(true);
    expect(fs.readFileSync(targetFile, "utf-8")).toBe("final");
  });
});
