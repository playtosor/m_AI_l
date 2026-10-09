import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-outbox-test-"));
const rosterFile = path.join(tempDir, "roster.md");
const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "get-outbox-external-test-"));

jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: externalDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
  HUMAN_HANDLE: "HUMAN",
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

import { getOutboxService } from "../services/get-outbox";
import { HUMAN_HANDLE } from "../domain/constants";
import { FileOperationError, RosterEntryNotFoundError } from "../domain/errors";

describe("get-outbox service", () => {
  beforeEach(() => {
    // V2.5 SIMPLIFY WS5 revisit: clean BOTH tempDir and externalDir so
    // fixtures from prior tests don't leak (WS5 review feedback).
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(externalDir)) {
      fs.rmSync(path.join(externalDir, entry), { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // One-shot cleanup of the root temp dirs (mkdtempSync siblings).
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  });

  it("should read the sender outbox next to an external mailbox declared in the roster", () => {
    const externalMailbox = path.join(externalDir, "mailbox_SHARED.md");
    const externalOutbox = path.join(externalDir, "outbox_SHARED.md");

    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
        "|--------|------|---------|--------|\n" +
        `| SHARED | Shared Agent | ${externalMailbox} | active |\n`
    );
    fs.writeFileSync(externalOutbox, "20260404-1030 // HUMAN // Ping\n<!-- END -->\n");

    const outbox = getOutboxService("TEST", "SHARED");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].recipient).toBe(HUMAN_HANDLE);
    expect(outbox[0].subject).toBe("Ping");
  });

  // V2.5 SIMPLIFY WS5 — Finding #13: error-path coverage for get-outbox.
  // (REVISTED: the previous try/catch wrapper was tautological — tautology
  // removed, explicit assertions on actual documented behaviour.)

  it("throws FileOperationError when the outbox file is missing", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n" +
        "| AGENT_MISSING | x | mailbox_AGENT.md | active |\n"
    );
    // No outbox file is created → getOutboxFromPath throws at fs.existsSync.
    expect(() => getOutboxService("TEST", "AGENT_MISSING")).toThrow(FileOperationError);
  });

  it("returns an empty array for an outbox with only a sentinel", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n" +
        "| SHARED | x | " + path.join(externalDir, "mailbox_SHARED.md") + " | active |\n"
    );
    fs.writeFileSync(path.join(externalDir, "outbox_SHARED.md"), "<!-- END -->\n");
    expect(getOutboxService("TEST", "SHARED")).toEqual([]);
  });

  it("still resolves an inactive handle (resolveMemberMailboxPath is deliverability-agnostic for read paths)", () => {
    // getOutboxService is a READ path: it does not call assertRecipientIsDeliverable.
    // An inactive handle whose outbox file is empty returns [], not throws.
    // (The check for inactive is in write paths only.)
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n" +
        "| INACTIVE_AGENT | x | " + path.join(externalDir, "mailbox_INACTIVE.md") + " | inactive |\n"
    );
    // Create the outbox file with sentinel-only content (so ensureSentinel
    // doesn't trigger a write). The path resolution from the roster gives
    // outbox_INACTIVE.md.
    fs.writeFileSync(path.join(externalDir, "outbox_INACTIVE_AGENT.md"), "<!-- END -->\n");
    expect(getOutboxService("TEST", "INACTIVE_AGENT")).toEqual([]);
  });

  it("throws on a corrupted outbox entry (missing ' // ' separator)", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n" +
        "| CORRUPT | x | " + path.join(externalDir, "mailbox_CORRUPT.md") + " | active |\n"
    );
    fs.writeFileSync(
      path.join(externalDir, "outbox_CORRUPT.md"),
      "no separator here at all\n<!-- END -->\n"
    );
    expect(() => getOutboxService("TEST", "CORRUPT")).toThrow(/Invalid outbox entry format/);
  });

  it("throws if the handle is not in the roster", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n|--------|------|---------|--------|\n" +
        "| SOMEBODY_ELSE | x | mailbox_SOMEBODY.md | active |\n"
    );
    // No inbox for "GHOST".
    expect(() => getOutboxService("TEST", "GHOST")).toThrow(RosterEntryNotFoundError);
  });
});
