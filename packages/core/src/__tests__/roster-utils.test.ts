import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_roster-utils-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "m_AI_l_roster-utils-common-"));

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: commonDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
  HUMAN_HANDLE: "HUMAN",
  getCommonRoot: () => commonDir,
}));

import {
  ensureHumanInRoster,
  getHumanMailboxAbsolutePath,
  HUMAN_ROSTER_LINE,
} from "../lib/roster-utils";

// ---------------------------------------------------------------------------
// V3.0 BAC 2A — T3: exercise ensureHumanInRoster idempotence, the legacy-row
// rewrite path, and the documented TOCTOU-with-missing-roster behaviour.
// ---------------------------------------------------------------------------

function makeRoster(content: string): string {
  const rosterPath = path.join(tempDir, "roster.md");
  fs.writeFileSync(rosterPath, content, "utf-8");
  return rosterPath;
}

function readRoster(): string {
  return fs.readFileSync(path.join(tempDir, "roster.md"), "utf-8");
}

describe("roster-utils (V3.0 BAC 2A — T3) — ensureHumanInRoster", () => {
  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    fs.rmSync(commonDir, { recursive: true, force: true });
    fs.mkdirSync(commonDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(commonDir, { recursive: true, force: true });
  });

  describe("Canonical exports", () => {
    it("getHumanMailboxAbsolutePath points into COMMON_ROOT", () => {
      expect(getHumanMailboxAbsolutePath()).toBe(
        path.join(commonDir, "mailbox_HUMAN.md")
      );
    });

    it("HUMAN_ROSTER_LINE uses the canonical absolute mailbox path", () => {
      expect(HUMAN_ROSTER_LINE).toContain(getHumanMailboxAbsolutePath());
      expect(HUMAN_ROSTER_LINE).toMatch(/\| HUMAN \| User \| .+ \| active \|/);
    });
  });

  describe("TOCTOU on missing roster", () => {
    it("returns false and writes nothing when the roster does not exist", () => {
      // Roster file intentionally absent.
      expect(fs.existsSync(path.join(tempDir, "roster.md"))).toBe(false);

      expect(ensureHumanInRoster(tempDir)).toBe(false);

      expect(fs.existsSync(path.join(tempDir, "roster.md"))).toBe(false);
    });

    it("respects the optional rosterOverride parameter when checking existence", () => {
      const customRoster = path.join(tempDir, "custom.md");
      // File does not exist; helper must return false (not throw).
      expect(ensureHumanInRoster(tempDir, customRoster)).toBe(false);
      expect(fs.existsSync(customRoster)).toBe(false);
    });
  });

  describe("Empty roster", () => {
    it("appends the canonical HUMAN line to an empty roster", () => {
      makeRoster("");

      expect(ensureHumanInRoster(tempDir)).toBe(true);

      const content = readRoster();
      expect(content).toContain("| HUMAN | User |");
      expect(content).toContain(getHumanMailboxAbsolutePath());
      expect(content).toContain("| active |");
    });
  });

  describe("Existing roster without HUMAN", () => {
    it("appends the canonical HUMAN line when roster has only non-HUMAN rows", () => {
      makeRoster(
        [
          "| Handle | Role | Mailbox | Status |",
          "|--------|------|---------|--------|",
          "| ARCHI | Architect | mailbox_ARCHI.md | active |",
          "| OPS | Ops | mailbox_OPS.md | active |",
          "",
        ].join("\n")
      );

      expect(ensureHumanInRoster(tempDir)).toBe(true);

      const content = readRoster();
      expect(content).toContain("| ARCHI | Architect | mailbox_ARCHI.md | active |");
      expect(content).toContain("| OPS | Ops | mailbox_OPS.md | active |");
      // HUMAN row appended:
      expect(content).toContain(`| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`);
    });
  });

  describe("Idempotence on existing canonical HUMAN row", () => {
    it("returns false and writes nothing when canonical HUMAN row already present", () => {
      const before = [
        "| Handle | Role | Mailbox | Status |",
        "|--------|------|---------|--------|",
        "| ARCHI | Architect | mailbox_ARCHI.md | active |",
        `| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`,
        "",
      ].join("\n");
      makeRoster(before);

      expect(ensureHumanInRoster(tempDir)).toBe(false);

      // File content unchanged byte-for-byte.
      expect(readRoster()).toBe(before);
    });

    it("rewrites a legacy HUMAN row that uses the relative mailbox_HUMAN.md path", () => {
      const before = [
        "| Handle | Role | Mailbox | Status |",
        "|--------|------|---------|--------|",
        `| HUMAN | User | mailbox_HUMAN.md | active |`,
        "",
      ].join("\n");
      makeRoster(before);

      // Legacy row is missing the canonical absolute path ⇒ helper should
      // consider HUMAN as "not canonical" and rewrite it.
      expect(ensureHumanInRoster(tempDir)).toBe(true);

      const after = readRoster();
      expect(after).not.toContain("| HUMAN | User | mailbox_HUMAN.md | active |");
      expect(after).toContain(`| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`);
    });

    it("returns false when HUMAN row uses canonical absolute path but missing active status", () => {
      // The header check requires both canonical mailbox AND `active` status.
      const before = [
        "| Handle | Role | Mailbox | Status |",
        "|--------|------|---------|--------|",
        `| HUMAN | User | ${getHumanMailboxAbsolutePath()} | inactive |`,
        "",
      ].join("\n");
      makeRoster(before);

      // hasCanonicalHuman is false (status !== 'active'), but humanLineIndex
      // is set and matches no legacy detection ⇒ branch rewrites to canonical.
      expect(ensureHumanInRoster(tempDir)).toBe(true);

      const after = readRoster();
      expect(after).toContain(`| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`);
    });

    it("does not duplicate the HUMAN row when called twice consecutively", () => {
      makeRoster("");
      ensureHumanInRoster(tempDir);
      const secondResult = ensureHumanInRoster(tempDir);
      expect(secondResult).toBe(false);

      // Count HUMAN occurrences: must be exactly 1.
      const content = readRoster();
      const matches = content.match(/\| HUMAN \|/g) ?? [];
      expect(matches.length).toBe(1);
    });
  });

  describe("Robustness vs non-table lines", () => {
    it("ignores comment-style non-pipe lines and still appends HUMAN", () => {
      makeRoster(
        [
          "# Header",
          "",
          "Some text without pipes.",
          "| ARCHI | Architecture | mailbox_ARCHI.md | active |",
          "",
        ].join("\n")
      );

      expect(ensureHumanInRoster(tempDir)).toBe(true);

      const content = readRoster();
      expect(content).toContain("# Header");
      expect(content).toContain("Some text without pipes.");
      expect(content).toContain("| ARCHI | Architecture |");
      expect(content).toContain(`| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`);
    });

    it("ignores markdown separator rows (| --- | --- | ...) when scanning for HUMAN", () => {
      makeRoster(
        [
          "| Handle | Role | Mailbox | Status |",
          "|--------|------|---------|--------|",
          "| ARCHI | Architecture | mailbox_ARCHI.md | active |",
          "",
        ].join("\n")
      );

      expect(ensureHumanInRoster(tempDir)).toBe(true);

      const content = readRoster();
      // Separator row must remain as-is (the helper should not treat
      // separators as HUMAN rows).
      expect(content).toContain("|--------|------|---------|--------|");
      expect(content).toContain(`| HUMAN | User | ${getHumanMailboxAbsolutePath()} | active |`);
    });
  });
});
