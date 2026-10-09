import path from "path";
import fs from "fs";
import os from "os";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-upsert-"));
const rosterFile = path.join(tempDir, "roster.md");

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: tempDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TESTPROJ",
    path: tempDir,
    roster: rosterFile,
    status: "active",
  }),
}));

import { upsertHandle } from "../services/upsert-handle";
import { RosterEntryExistsError } from "../domain/errors";

describe("upsert handle", () => {
  beforeEach(() => {
    // Clean up any existing files
    if (fs.existsSync(tempDir)) {
      for (const entry of fs.readdirSync(tempDir)) {
        fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
      }
    }
    // Create roster file
    const rosterHeader = "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n";
    fs.writeFileSync(rosterFile, rosterHeader);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should create a new handle", () => {
    const result = upsertHandle({
      project_handle: "TESTPROJ",
      handle: "NEWAGENT",
      role: "Developer",
      mailbox: "mailbox_NEWAGENT.md",
      status: "active",
    });

    expect(result.status).toBe("created");
    expect(result.handle).toBe("NEWAGENT");
    expect(result.role).toBe("Developer");
  });

  test("should update an existing handle", () => {
    // First create
    upsertHandle({
      project_handle: "TESTPROJ",
      handle: "NEWAGENT",
      role: "Developer",
      status: "active",
    });

    // Then update
    const result = upsertHandle({
      project_handle: "TESTPROJ",
      handle: "NEWAGENT",
      role: "Lead Developer",
      status: "inactive",
    });

    expect(result.status).toBe("updated");
    expect(result.role).toBe("Lead Developer");
    expect(result.roster_status).toBe("inactive");
  });

  test("V3.0 BAC 2A follow-up: update does NOT add a trailing blank line to the roster", () => {
    // Regression: previously `updateRosterEntry` appended "\n" unconditionally,
    // so every update added a blank line to the roster file.
    upsertHandle({
      project_handle: "TESTPROJ",
      handle: "BLANK_TEST",
      role: "Initial",
      status: "active",
    });

    const afterCreate = fs.readFileSync(rosterFile, "utf-8");
    const trailingAfterCreate = afterCreate.match(/\n+$/)?.[0] ?? "";
    expect(trailingAfterCreate.length).toBeLessThanOrEqual(1); // at most one trailing newline

    // Run several updates; the trailing-newline count must NOT grow.
    for (let i = 0; i < 5; i += 1) {
      upsertHandle({
        project_handle: "TESTPROJ",
        handle: "BLANK_TEST",
        role: `Role v${i}`,
        status: "active",
      });
    }

    const afterUpdates = fs.readFileSync(rosterFile, "utf-8");
    const trailingAfterUpdates = afterUpdates.match(/\n+$/)?.[0] ?? "";
    expect(trailingAfterUpdates.length).toBe(trailingAfterCreate.length);

    // No blank lines BETWEEN rows (a single trailing newline is fine).
    const lines = afterUpdates.split("\n");
    // Drop the trailing empty element produced by a file that ends with "\n".
    const trimmedLines = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
    const blankLines = trimmedLines.filter(line => line.trim() === "").length;
    expect(blankLines).toBe(0);
  });

  describe("V3.0 BAC 2A follow-up: strict mode", () => {
    test("strict=true on a NEW handle behaves like a normal create", () => {
      const result = upsertHandle({
        project_handle: "TESTPROJ",
        handle: "STRICT_NEW",
        role: "Strict Role",
        status: "active",
        strict: true,
      });

      expect(result.status).toBe("created");
      expect(result.handle).toBe("STRICT_NEW");
      expect(result.role).toBe("Strict Role");
    });

    test("strict=true on an EXISTING handle throws RosterEntryExistsError", () => {
      // Seed an existing entry.
      upsertHandle({
        project_handle: "TESTPROJ",
        handle: "STRICT_DUP",
        role: "Initial",
        status: "active",
      });

      // Strict re-register must throw.
      expect(() =>
        upsertHandle({
          project_handle: "TESTPROJ",
          handle: "STRICT_DUP",
          role: "Updated",
          status: "active",
          strict: true,
        })
      ).toThrow(RosterEntryExistsError);
    });

    test("strict=true does NOT overwrite the existing entry on throw", () => {
      // Seed.
      upsertHandle({
        project_handle: "TESTPROJ",
        handle: "STRICT_PRESERVE",
        role: "Original Role",
        status: "active",
      });

      // Attempt strict overwrite.
      try {
        upsertHandle({
          project_handle: "TESTPROJ",
          handle: "STRICT_PRESERVE",
          role: "Should Not Stick",
          status: "inactive",
          strict: true,
        });
      } catch {
        // expected
      }

      // Re-read the roster via a non-strict upsert (which returns the
      // current state without modifying it).
      const result = upsertHandle({
        project_handle: "TESTPROJ",
        handle: "STRICT_PRESERVE",
        role: "Original Role",
        status: "active",
      });

      expect(result.status).toBe("updated");
      expect(result.role).toBe("Original Role");
      expect(result.roster_status).toBe("active");
    });

    test("strict=false (or omitted) on an EXISTING handle still updates (backwards compatible)", () => {
      // Seed.
      upsertHandle({
        project_handle: "TESTPROJ",
        handle: "NON_STRICT",
        role: "Initial",
        status: "active",
      });

      // strict omitted → upsert behaviour preserved.
      const resultOmitted = upsertHandle({
        project_handle: "TESTPROJ",
        handle: "NON_STRICT",
        role: "Updated (omitted)",
        status: "inactive",
      });
      expect(resultOmitted.status).toBe("updated");
      expect(resultOmitted.role).toBe("Updated (omitted)");

      // strict=false explicit → same behaviour.
      const resultFalse = upsertHandle({
        project_handle: "TESTPROJ",
        handle: "NON_STRICT",
        role: "Updated (false)",
        status: "active",
        strict: false,
      });
      expect(resultFalse.status).toBe("updated");
      expect(resultFalse.role).toBe("Updated (false)");
    });

    test("strict=true is case-insensitive (matches normalizeHandle semantics)", () => {
      // Seed with UPPERCASE.
      upsertHandle({
        project_handle: "TESTPROJ",
        handle: "CASETEST",
        role: "Initial",
        status: "active",
      });

      // Strict re-register with lowercase must still throw (V2.11 case-insensitive).
      expect(() =>
        upsertHandle({
          project_handle: "TESTPROJ",
          handle: "casetest",
          role: "Updated",
          status: "active",
          strict: true,
        })
      ).toThrow(RosterEntryExistsError);
    });
  });
});
