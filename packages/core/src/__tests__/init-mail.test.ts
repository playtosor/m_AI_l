import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-mail-test-"));
const rosterFile = path.join(tempDir, "roster.md");
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-mail-external-test-"));

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: externalDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: () => ({
    name: "TEST",
    path: tempDir,
    roster: rosterFile,
    status: "active",
  }),
  getProjects: () => [
    {
      name: "TEST",
      path: tempDir,
      roster: rosterFile,
      status: "active",
    },
    {
      name: "EXTERNAL",
      path: externalDir,
      status: "active",
    },
  ],
}));

import { initMail } from "../services/init-mail";
import { RosterEntryExistsError } from "../domain/errors";

describe("init-mail", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
  });

  it("should fail before creating files when the handle already exists", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT1 | Existing Agent | mailbox_AGENT1.md | active |\n"
    );
    expect(() => initMail("TEST", "AGENT1", "New Role", "mailbox_AGENT1.md")).toThrow(
      RosterEntryExistsError
    );
    expect(fs.existsSync(path.join(tempDir, "mailbox_AGENT1.md"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "mailbox_AGENT1_archive.md"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "outbox_AGENT1.md"))).toBe(false);
  });

  it("should create files and update the roster when the handle does not exist", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" + "|--------|------|---------|--------|\n"
    );
    initMail("TEST", "AGENT2", "Test Agent", "mailbox_AGENT2.md");
    expect(fs.existsSync(path.join(tempDir, "mailbox_AGENT2.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "mailbox_AGENT2_archive.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "outbox_AGENT2.md"))).toBe(true);
    expect(fs.readFileSync(rosterFile, "utf-8")).toContain(
      "| AGENT2 | Test Agent | mailbox_AGENT2.md | active |"
    );
  });

  it("should create files next to a custom mailbox path and store the custom mailbox value in the roster", () => {
    const externalMailbox = path.join(externalDir, "mailbox_AGENT3.md");
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" + "|--------|------|---------|--------|\n"
    );
    initMail("TEST", "AGENT3", "External Agent", externalMailbox);
    expect(fs.existsSync(externalMailbox)).toBe(true);
    expect(fs.existsSync(path.join(externalDir, "mailbox_AGENT3_archive.md"))).toBe(true);
    expect(fs.existsSync(path.join(externalDir, "outbox_AGENT3.md"))).toBe(true);
    expect(fs.readFileSync(rosterFile, "utf-8")).toContain(
      `| AGENT3 | External Agent | ${externalMailbox} | active |`
    );
  });
});
