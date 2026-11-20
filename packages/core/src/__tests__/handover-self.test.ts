import { handoverSelfService } from "../services/handover-self";
import { HUMAN_HANDLE } from "../domain/constants";
import fs from "fs";
import os from "os";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-self-test-"));
const rosterFile = path.join(tempDir, "roster.md");
const commonDir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-self-common-test-"));

// Lazy resolution (D1/D4): this suite does not mock domain/constants, so the
// COMMON_PATH env must point at the test's common dir before any writeMail.
const originalCommonPath = process.env.COMMON_PATH;
process.env.COMMON_PATH = commonDir;

afterAll(() => {
  if (originalCommonPath !== undefined) process.env.COMMON_PATH = originalCommonPath;
  else delete process.env.COMMON_PATH;
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(commonDir, { recursive: true, force: true });
});

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
      name: "COMMON_TEST",
      path: commonDir,
      status: "active",
    },
  ],
}));

jest.mock("../lib/paths", () => {
  const actual = jest.requireActual("../lib/paths");

  return {
    ...actual,
    getProjectsPath: () => path.join(commonDir, "projects_config.md"),
  };
});

describe("handover-self service", () => {
  beforeEach(() => {
    for (const entry of fs.readdirSync(tempDir)) {
      fs.rmSync(path.join(tempDir, entry), { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(commonDir)) {
      fs.rmSync(path.join(commonDir, entry), { recursive: true, force: true });
    }
  });

  it("should write a standard handover to the same handle", () => {
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| ARCHI | Architecture | mailbox_ARCHI.md | active |\n"
    );
    fs.writeFileSync(path.join(tempDir, "mailbox_ARCHI.md"), "<!-- END -->\n");
    fs.writeFileSync(path.join(tempDir, "outbox_ARCHI.md"), "<!-- END -->\n");

    const result = handoverSelfService("TEST", "ARCHI", "Current task: continue");

    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_ARCHI.md"), "utf-8");
    const outboxContent = fs.readFileSync(path.join(tempDir, "outbox_ARCHI.md"), "utf-8");

    expect(result.sender).toBe("ARCHI");
    expect(result.recipient).toBe("ARCHI");
    expect(result.priority).toBe("H");
    expect(result.subject).toBe("Handover");
    expect(mailboxContent).toContain("ARCHI //");
    expect(mailboxContent).toContain(" // H // Handover // ");
    expect(mailboxContent).toContain("Current task: continue");
    expect(outboxContent).toContain("ARCHI // Handover");
  });

  it("should allow writing on behalf of the renewed handle", () => {
    const humanMailbox = path.join(commonDir, "mailbox_HUMAN.md");
    const humanOutbox = path.join(commonDir, "outbox_HUMAN.md");
    fs.writeFileSync(
      rosterFile,
      "| Handle | Role | Mailbox | Status |\n" +
      "|--------|------|---------|--------|\n" +
      "| ARCHI | Architecture | mailbox_ARCHI.md | active |\n" +
      `| HUMAN | Human | ${humanMailbox} | active |\n`
    );
    fs.writeFileSync(path.join(tempDir, "mailbox_ARCHI.md"), "<!-- END -->\n");
    fs.writeFileSync(humanOutbox, "<!-- END -->\n");

    const result = handoverSelfService("TEST", "ARCHI", "Next steps: resume", HUMAN_HANDLE);

    const mailboxContent = fs.readFileSync(path.join(tempDir, "mailbox_ARCHI.md"), "utf-8");
    const outboxContent = fs.readFileSync(path.join(commonDir, "outbox_HUMAN.md"), "utf-8");

    expect(result.sender).toBe(HUMAN_HANDLE);
    expect(mailboxContent).toContain("HUMAN //");
    expect(outboxContent).toContain("ARCHI // Handover");
  });
});
