import { getRoster, addRosterEntry } from "../repositories/roster-repo";
import fs from "fs";
import os from "os";
import path from "path";

describe("roster-repo", () => {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "roster-repo-test-"));
  const rosterFile = path.join(projectPath, "roster.md");

  beforeEach(() => {
    if (fs.existsSync(rosterFile)) {
      fs.unlinkSync(rosterFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(rosterFile)) {
      fs.unlinkSync(rosterFile);
    }
  });

  describe("getRoster", () => {
    it("should return parsed roster entries", () => {
      fs.writeFileSync(
        rosterFile,
        "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Test Agent | mailbox_AGENT1.md | active |"
      );

      const roster = getRoster(projectPath);

      expect(roster).toHaveLength(1);
      expect(roster[0].handle).toBe("AGENT1");
    });

    it("should throw error if roster file does not exist", () => {
      expect(() => getRoster(projectPath)).toThrow();
    });
  });

  describe("addRosterEntry", () => {
    it("should add a new roster entry", () => {
      fs.writeFileSync(
        rosterFile,
        "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n"
      );

      addRosterEntry(projectPath, {
        handle: "AGENT1",
        role: "Test Agent",
        mailbox: "mailbox_AGENT1.md",
        status: "active",
      });

      const content = fs.readFileSync(rosterFile, "utf-8");
      expect(content).toContain("AGENT1");
    });

    it("should create roster file if it does not exist", () => {
      addRosterEntry(projectPath, {
        handle: "AGENT1",
        role: "Test Agent",
        mailbox: "mailbox_AGENT1.md",
        status: "active",
      });

      expect(fs.existsSync(rosterFile)).toBe(true);
    });

    it("should throw error if entry already exists", () => {
      fs.writeFileSync(
        rosterFile,
        "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Test Agent | mailbox_AGENT1.md | active |"
      );

      expect(() =>
        addRosterEntry(projectPath, {
          handle: "AGENT1",
          role: "Test Agent",
          mailbox: "mailbox_AGENT1.md",
          status: "active",
        })
      ).toThrow();
    });
  });
});
