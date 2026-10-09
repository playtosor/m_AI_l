import fs from "fs";
import path from "path";

const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "mcp-public-test-"));

// Mock constants.ts
jest.mock("../domain/constants", () => ({
  PROJECT_ROOT: tempDir,
  COMMON_ROOT: tempDir,
  SENTINEL: "<!-- END -->",
  ROSTER_FILE: "roster.md",
  PROJECTS_FILE: "projects_config.md",
  MESSAGE_FORMAT: "HANDLE // YYYYMMDD-HHMM // PRIORITY // SUBJECT // Body",
}));

// Import listTools from server.ts (now exported)
import { listTools } from "@m_ai_l/mcp";

describe("MCP public V2 — mailbox_override absent", () => {
  test("Cas 13: mailbox_override n'est pas dans les tools publics", () => {
    const tools: string[] = listTools();
    expect(tools).not.toContain("mailbox_override");
    expect(tools).toContain("read_mail");
    expect(tools).toContain("write_mail");
    expect(tools).toContain("cancel_mail");
    expect(tools).toContain("edit_mail");
    expect(tools).toContain("archive_mail");
    expect(tools.length).toBe(5);
  });
});
