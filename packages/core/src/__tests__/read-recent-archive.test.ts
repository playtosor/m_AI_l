import { readRecentArchiveService } from "../services/read-recent-archive";

const mockResolveHandleCandidatesService = jest.fn();
const mockGetProject = jest.fn();
const mockGetRoster = jest.fn();
const mockReadMailboxSnapshotFromPath = jest.fn();

jest.mock("../services/resolve-handle-candidates", () => ({
  resolveHandleCandidatesService: (...args: unknown[]) => mockResolveHandleCandidatesService(...args),
}));

jest.mock("../repositories/projects-repo", () => ({
  getProject: (...args: unknown[]) => mockGetProject(...args),
}));

jest.mock("../repositories/roster-repo", () => ({
  getRoster: (...args: unknown[]) => mockGetRoster(...args),
}));

jest.mock("../repositories/mailbox-repo", () => ({
  readMailboxSnapshotFromPath: (...args: unknown[]) => mockReadMailboxSnapshotFromPath(...args),
}));

describe("read-recent-archive service", () => {
  beforeEach(() => {
    mockResolveHandleCandidatesService.mockReset();
    mockGetProject.mockReset();
    mockGetRoster.mockReset();
    mockReadMailboxSnapshotFromPath.mockReset();
  });

  it("should return the newest archived messages first when resolution is unique", () => {
    mockResolveHandleCandidatesService.mockReturnValue({
      query_handle: "ARCHI",
      current_project_handle: "MAILEXPORT",
      current_project_source: "explicit",
      resolution_scope_used: "current_project",
      candidates: [
        {
          project_handle: "MAILEXPORT",
          project_path: "C:\\dev\\m_AI_l_EXPORT",
          handle: "ARCHI",
          role: "Architecture",
          status: "active",
          mailbox: "mailbox_ARCHI.md",
          resolved_mailbox: "C:\\dev\\m_AI_l_EXPORT\\mailbox_ARCHI.md",
        },
      ],
    });
    mockGetProject.mockReturnValue({
      name: "MAILEXPORT",
      path: "C:\\dev\\m_AI_l_EXPORT",
      roster: "C:\\dev\\m_AI_l_EXPORT\\roster.md",
    });
    mockGetRoster.mockReturnValue([
      {
        handle: "ARCHI",
        role: "Architecture",
        mailbox: "mailbox_ARCHI.md",
        status: "active",
      },
    ]);
    mockReadMailboxSnapshotFromPath.mockReturnValue({
      messages: [
        { sender: "A", timestamp: "20260407-1000", priority: "M", subject: "One", body: "Body 1" },
        { sender: "B", timestamp: "20260407-1010", priority: "H", subject: "Two", body: "Body 2" },
        { sender: "C", timestamp: "20260407-1020", priority: "L", subject: "Three", body: "Body 3" },
      ],
      invalid_lines: [],
      warning_count: 0,
    });

    const result = readRecentArchiveService("ARCHI", 2, "MAILEXPORT");

    expect(result.status).toBe("ok");
    expect(result.resolved_project_handle).toBe("MAILEXPORT");
    expect(result.count).toBe(2);
    expect(result.messages.map(message => message.subject)).toEqual(["Three", "Two"]);
  });

  it("should return candidates without reading when resolution is ambiguous", () => {
    mockResolveHandleCandidatesService.mockReturnValue({
      query_handle: "ARCHI",
      current_project_handle: "SKILLDOCU",
      current_project_source: "explicit",
      resolution_scope_used: "ambiguous",
      candidates: [
        {
          project_handle: "SOCIALUML",
          project_path: "C:\\dev\\socialUML",
          handle: "ARCHI",
          role: "Architecture",
          status: "active",
          mailbox: "mailbox_ARCHI.md",
          resolved_mailbox: "C:\\dev\\socialUML\\mailbox_ARCHI.md",
        },
        {
          project_handle: "ATORNAI",
          project_path: "C:\\dev\\atornai",
          handle: "ARCHI",
          role: "Architecture",
          status: "active",
          mailbox: "mailbox_ARCHI.md",
          resolved_mailbox: "C:\\dev\\atornai\\mailbox_ARCHI.md",
        },
      ],
    });

    const result = readRecentArchiveService("ARCHI", 1, "SKILLDOCU");

    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
    expect(mockReadMailboxSnapshotFromPath).not.toHaveBeenCalled();
  });

  it("should return not_found when no handle can be resolved", () => {
    mockResolveHandleCandidatesService.mockReturnValue({
      query_handle: "UNKNOWN",
      current_project_handle: "MAILEXPORT",
      current_project_source: "explicit",
      resolution_scope_used: "none",
      candidates: [],
    });

    const result = readRecentArchiveService("UNKNOWN", 1, "MAILEXPORT");

    expect(result.status).toBe("not_found");
    expect(result.messages).toEqual([]);
    expect(mockReadMailboxSnapshotFromPath).not.toHaveBeenCalled();
  });
});
