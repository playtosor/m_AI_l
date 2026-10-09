import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-messages-test-"));
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-messages-common-test-"));
const rosterFile = path.join(tempDir, "roster.md");

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: commonDir,
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
}));

jest.mock("../lib/paths", () => {
  const actual = jest.requireActual("../lib/paths");
  return {
    ...actual,
    getProjectsPath: () => path.join(commonDir, "projects_config.md"),
  };
});

import { listMessages } from "../services/list-messages";

describe("listMessages service", () => {
  let mailboxFile: string;
  let archiveFile: string;

  beforeAll(() => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        "| AGENT | Test agent | mailbox_AGENT.md | active |\n"
    );
  });

  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      if (entry === "roster.md") continue;
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    mailboxFile = path.join(tempDir, "mailbox_AGENT.md");
    archiveFile = path.join(tempDir, "mailbox_AGENT_archive.md");
  });

  function seedMailbox(content: string): void {
    fs.writeFileSync(mailboxFile, content);
  }

  function seedArchive(content: string): void {
    fs.writeFileSync(archiveFile, content);
  }

  it("returns the first page with correct total/hasMore", () => {
    seedMailbox(
      "A // 20260101-0900 // H // First // body-1\n" +
        "B // 20260102-0900 // M // Second // body-2\n" +
        "C // 20260103-0900 // L // Third // body-3\n" +
        "D // 20260104-0900 // H // Fourth // body-4\n" +
        "<!-- END -->\n"
    );

    const result = listMessages({
      mailbox: { project_handle: "TEST", handle: "AGENT" },
      source: "active",
      offset: 0,
      limit: 2,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].subject).toBe("First");
    expect(result.messages[1].subject).toBe("Second");
    expect(result.messages[0].body).toBe("body-1");
    expect(result.total).toBe(4);
    expect(result.hasMore).toBe(true);
  });

  it("returns the second page and reports hasMore=false when last", () => {
    seedMailbox(
      "A // 20260101-0900 // H // First // body-1\n" +
        "B // 20260102-0900 // M // Second // body-2\n" +
        "C // 20260103-0900 // L // Third // body-3\n" +
        "D // 20260104-0900 // H // Fourth // body-4\n" +
        "<!-- END -->\n"
    );

    const result = listMessages({
      mailbox: { project_handle: "TEST", handle: "AGENT" },
      source: "active",
      offset: 2,
      limit: 2,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].subject).toBe("Third");
    expect(result.messages[1].subject).toBe("Fourth");
    expect(result.total).toBe(4);
    expect(result.hasMore).toBe(false);
  });

  it("returns hasMore=false when total equals limit", () => {
    seedMailbox(
      "A // 20260101-0900 // H // Only // body\n" +
        "<!-- END -->\n"
    );

    const result = listMessages({
      mailbox: { project_handle: "TEST", handle: "AGENT" },
      source: "active",
      offset: 0,
      limit: 1,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it("returns empty messages when offset is past the end", () => {
    seedMailbox(
      "A // 20260101-0900 // H // Only // body\n" +
        "<!-- END -->\n"
    );

    const result = listMessages({
      mailbox: { project_handle: "TEST", handle: "AGENT" },
      source: "active",
      offset: 10,
      limit: 5,
    });

    expect(result.messages).toHaveLength(0);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it("reassembles multi-line bodies", () => {
    seedMailbox(
      "A // 20260101-0900 // H // Subject // line-1\n" +
        "line-2 of body\n" +
        "line-3 of body\n" +
        "<!-- END -->\n"
    );

    const result = listMessages({
      mailbox: { project_handle: "TEST", handle: "AGENT" },
      source: "active",
      offset: 0,
      limit: 5,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].body).toBe("line-1\nline-2 of body\nline-3 of body");
  });

  it("reads from archive when source=archive", () => {
    seedArchive(
      "X // 20260101-0800 // M // Archived // old-body\n" +
        "Y // 20260102-0800 // H // Archived-2 // old-body-2\n" +
        "<!-- END -->\n"
    );

    const result = listMessages({
      mailbox: { project_handle: "TEST", handle: "AGENT" },
      source: "archive",
      offset: 0,
      limit: 5,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].subject).toBe("Archived");
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it("throws MailboxNotFoundError when the active file is missing", () => {
    expect(() =>
      listMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
        offset: 0,
        limit: 5,
      })
    ).toThrow(/Mailbox for handle AGENT not found/);
  });

  it("throws MailboxNotFoundError when the archive file is missing", () => {
    seedMailbox("<!-- END -->\n");
    expect(() =>
      listMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "archive",
        offset: 0,
        limit: 5,
      })
    ).toThrow(/Mailbox for handle AGENT not found/);
  });

  it("rejects negative offset or limit", () => {
    expect(() =>
      listMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
        offset: -1,
        limit: 5,
      })
    ).toThrow(/non-negative/);
    expect(() =>
      listMessages({
        mailbox: { project_handle: "TEST", handle: "AGENT" },
        source: "active",
        offset: 0,
        limit: -5,
      })
    ).toThrow(/non-negative/);
  });
});
