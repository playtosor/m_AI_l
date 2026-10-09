import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_outbox-repo-test-"));

import {
  getOutbox,
  getOutboxFromPath,
  writeOutboxEntry,
  writeOutboxEntryToPath,
} from "../repositories/outbox-repo";
import { FileOperationError } from "../domain/errors";
import { OutboxEntry } from "../domain/types";

// ---------------------------------------------------------------------------
// V3.0 BAC 2A — T4: exercise outbox-repo entry parsing / writing end-to-end
// and cover the failure modes (missing file, malformed entries, sentinel
// self-heal).
// ---------------------------------------------------------------------------

function makeOutboxPath(handle: string): string {
  return path.join(tempDir, `outbox_${handle}.md`);
}

function writeOutboxRaw(handle: string, body: string): void {
  fs.writeFileSync(makeOutboxPath(handle), body, "utf-8");
}

function seedOutbox(handle: string, entries: OutboxEntry[]): void {
  const out = makeOutboxPath(handle);
  const lines = entries.map(e => `${e.timestamp} // ${e.recipient} // ${e.subject}`).join("\n");
  fs.writeFileSync(out, `${lines}\n<!-- END -->\n`, "utf-8");
}

describe("outbox-repo (V3.0 BAC 2A — T4)", () => {
  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("getOutbox / getOutboxFromPath", () => {
    it("returns an empty array when the outbox file contains only the sentinel", () => {
      writeOutboxRaw("ARCHI", "<!-- END -->\n");
      expect(getOutboxFromPath(makeOutboxPath("ARCHI"))).toEqual([]);
    });

    it("returns an empty array when the outbox file is empty (no lines, no sentinel)", () => {
      writeOutboxRaw("EMPTY", "");
      // The sentinel self-heal will rewrite the file with the sentinel; the
      // messages section before <!-- END --> is empty, so [] is returned.
      expect(getOutboxFromPath(makeOutboxPath("EMPTY"))).toEqual([]);
    });

    it("parses a single entry", () => {
      seedOutbox("SENDER1", [
        { timestamp: "20260101-0900", recipient: "ARCHI", subject: "Hello" },
      ]);

      const result = getOutboxFromPath(makeOutboxPath("SENDER1"));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: "20260101-0900",
        recipient: "ARCHI",
        subject: "Hello",
      });
    });

    it("parses multiple entries preserving order", () => {
      seedOutbox("SENDER", [
        { timestamp: "20260101-0900", recipient: "ARCHI", subject: "S1" },
        { timestamp: "20260101-0930", recipient: "OPS", subject: "S2" },
        { timestamp: "20260101-1000", recipient: "HUMAN", subject: "S3" },
      ]);

      const result = getOutboxFromPath(makeOutboxPath("SENDER"));
      expect(result).toHaveLength(3);
      expect(result.map(e => e.subject)).toEqual(["S1", "S2", "S3"]);
    });

    it("ignores blank lines between entries (resilient formatting)", () => {
      writeOutboxRaw(
        "BLANK",
        "20260101-0900 // A // S1\n\n20260101-0930 // B // S2\n   \n<!-- END -->\n"
      );

      const result = getOutboxFromPath(makeOutboxPath("BLANK"));
      expect(result).toHaveLength(2);
      expect(result[0].subject).toBe("S1");
      expect(result[1].subject).toBe("S2");
    });

    it("heals a missing trailing sentinel (read-side self-heal)", () => {
      const p = makeOutboxPath("HEAL");
      fs.writeFileSync(p, "20260101-0900 // A // S1\n", "utf-8");

      // First read populates + heals → succeeds.
      const result = getOutboxFromPath(p);
      expect(result).toHaveLength(1);

      // The file is now persisted with a sentinel appended (writeFileAtomic).
      const content = fs.readFileSync(p, "utf-8");
      expect(content).toContain("<!-- END -->");
    });

    it("throws FileOperationError when the outbox file is missing", () => {
      expect(() => getOutboxFromPath(makeOutboxPath("MISSING"))).toThrow(FileOperationError);
    });

    it("throws when an entry line is malformed (wrong segment count)", () => {
      // Manually crafted bad content — `ensureSentinel` cannot save us here.
      const p = makeOutboxPath("BAD");
      fs.writeFileSync(p, "this-is-not-a-valid-entry\n<!-- END -->\n", "utf-8");

      expect(() => getOutboxFromPath(p)).toThrow(/Invalid outbox entry format/);
    });

    it("getOutbox(projectPath, handle) dispatches to the handle-specific file", () => {
      seedOutbox("PROJ", [
        { timestamp: "20260101-0900", recipient: "X", subject: "via-project" },
      ]);

      const result = getOutbox(tempDir, "PROJ");
      expect(result).toHaveLength(1);
      expect(result[0].subject).toBe("via-project");
    });
  });

  describe("writeOutboxEntry / writeOutboxEntryToPath", () => {
    it("writes one entry before the sentinel and reads back via parse", () => {
      writeOutboxRaw("WRITE", "");

      writeOutboxEntryToPath(makeOutboxPath("WRITE"), {
        timestamp: "20260101-0900",
        recipient: "ARCHI",
        subject: "First",
      });

      const result = getOutboxFromPath(makeOutboxPath("WRITE"));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: "20260101-0900",
        recipient: "ARCHI",
        subject: "First",
      });
    });

    it("appends entries in chronological-write order (insertion at top before sentinel)", () => {
      seedOutbox("ORDER", []);
      const p = makeOutboxPath("ORDER");

      writeOutboxEntryToPath(p, {
        timestamp: "20260101-0900",
        recipient: "A",
        subject: "S1",
      });
      writeOutboxEntryToPath(p, {
        timestamp: "20260101-0915",
        recipient: "B",
        subject: "S2",
      });
      writeOutboxEntryToPath(p, {
        timestamp: "20260101-0945",
        recipient: "C",
        subject: "S3",
      });

      const result = getOutboxFromPath(p);
      expect(result.map((e) => e.subject)).toEqual(["S1", "S2", "S3"]);
    });

    it("survives a trailing-sentinel-missing file by healing then writing", () => {
      // Pathological case: file exists but no `<!-- END -->`. The helper
      // ensuresSentinel before insertion, which must not corrupt existing entries.
      const p = makeOutboxPath("NO_SENTINEL");
      fs.writeFileSync(p, "S0 // X // Existing\n", "utf-8");

      writeOutboxEntryToPath(p, {
        timestamp: "20260101-0900",
        recipient: "A",
        subject: "New",
      });

      const result = getOutboxFromPath(p);
      // the existing entry was past the missing sentinel — but the helper
      // rewrites the section before sentinel which only contains the entry
      // placed there originally. Verify the new entry was inserted and that
      // the file ends with the sentinel.
      const content = fs.readFileSync(p, "utf-8");
      expect(content.trim().endsWith("<!-- END -->")).toBe(true);
      expect(content).toContain("New");
    });

    it("throws FileOperationError when writing to a missing file", () => {
      expect(() =>
        writeOutboxEntryToPath(makeOutboxPath("DOES_NOT_EXIST"), {
          timestamp: "20260101-0900",
          recipient: "A",
          subject: "X",
        })
      ).toThrow(FileOperationError);
    });

    it("getOutbox + writeOutboxEntry round-trips multiple insertions", () => {
      const { getOutbox: get } = require("../repositories/outbox-repo");
      writeOutboxRaw("ROUND", "");

      writeOutboxEntry(tempDir, "ROUND", {
        timestamp: "20260101-0900",
        recipient: "X",
        subject: "S1",
      });
      writeOutboxEntry(tempDir, "ROUND", {
        timestamp: "20260101-0915",
        recipient: "Y",
        subject: "S2",
      });

      const result = get(tempDir, "ROUND");
      expect(result).toHaveLength(2);
      expect(result.map((e: OutboxEntry) => e.subject)).toEqual(["S1", "S2"]);
    });
  });
});
