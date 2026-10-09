import { resolveHandleCandidatesService } from "../services/resolve-handle-candidates";
import path from "path";

const projects = [
  {
    name: "COMMON",
    path: "C:\\dev\\common",
    roster: "C:\\dev\\common\\roster.md",
    status: "active",
  },
  {
    name: "SKILLDOCU",
    path: "C:\\dev\\SKILLDOCU",
    roster: "C:\\dev\\SKILLDOCU\\roster.md",
    status: "active",
  },
  {
    name: "SOCIALUML",
    path: "C:\\dev\\socialUML",
    roster: "C:\\dev\\socialUML\\roster.md",
    status: "active",
  },
  {
    name: "ATORNAI",
    path: "C:\\dev\\atornai",
    roster: "C:\\dev\\atornai\\roster.md",
    status: "active",
  },
  {
    name: "LABY",
    path: "C:\\dev\\labyChrono",
    roster: "C:\\dev\\labyChrono\\roster.md",
    status: "active",
  },
];

const rosters: Record<string, { handle: string; role: string; mailbox: string; status: string }[]> = {
  "C:\\dev\\common": [
    { handle: "COMMON", role: "Common architect", mailbox: "mailbox_COMMON.md", status: "active" },
  ],
  "C:\\dev\\SKILLDOCU": [
    { handle: "DOC", role: "Doc agent", mailbox: "mailbox_DOC.md", status: "active" },
  ],
  "C:\\dev\\socialUML": [
    { handle: "DATA", role: "Data specialist", mailbox: "mailbox_DATA.md", status: "active" },
    { handle: "ARCHI", role: "Architecture", mailbox: "mailbox_ARCHI.md", status: "active" },
  ],
  "C:\\dev\\atornai": [
    { handle: "ARCHI", role: "Architecture", mailbox: "mailbox_ARCHI.md", status: "active" },
  ],
};

jest.mock("../repositories/projects-repo", () => ({
  getProjects: () => projects,
  getProject: (projectHandle: string) => {
    const project = projects.find(entry => entry.name === projectHandle);
    if (!project) {
      throw new Error(`Unknown project ${projectHandle}`);
    }

    return project;
  },
}));

jest.mock("../repositories/roster-repo", () => ({
  getRoster: (projectPath: string) => {
    if (projectPath === "C:\\dev\\labyChrono") {
      throw new (jest.requireActual("../domain/errors").FileOperationError)(`Roster file not found: ${projectPath}\\roster.md`);
    }

    return rosters[projectPath] ?? [];
  },
}));

describe("resolve-handle-candidates service", () => {
  it("should resolve a handle inside the current project first", () => {
    const result = resolveHandleCandidatesService("DOC", "SKILLDOCU");

    expect(result.current_project_handle).toBe("SKILLDOCU");
    expect(result.current_project_source).toBe("explicit");
    expect(result.resolution_scope_used).toBe("current_project");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].project_handle).toBe("SKILLDOCU");
  });

  it("should fall back to COMMON before global search", () => {
    const result = resolveHandleCandidatesService("COMMON", "SKILLDOCU");

    expect(result.resolution_scope_used).toBe("common");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].project_handle).toBe("COMMON");
  });

  it("should resolve a unique global match when absent locally and in COMMON", () => {
    const result = resolveHandleCandidatesService("DATA", "SKILLDOCU");

    expect(result.resolution_scope_used).toBe("global");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].project_handle).toBe("SOCIALUML");
  });

  it("should return all candidates when the global search is ambiguous", () => {
    const result = resolveHandleCandidatesService("ARCHI", "SKILLDOCU");

    expect(result.resolution_scope_used).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map(candidate => candidate.project_handle)).toEqual(["SOCIALUML", "ATORNAI"]);
  });

  it("should infer the current project from cwd when not provided explicitly", () => {
    // V3.0 BAC 2A — S7: cwd must be an absolute, existing directory.
    // S7's existence check rejects this case, so use the project root itself
    // (which exists at the resolution path) to keep the same matching scope.
    const result = resolveHandleCandidatesService("DOC", undefined, "C:\\dev\\SKILLDOCU");

    expect(result.current_project_handle).toBe("SKILLDOCU");
    expect(result.current_project_source).toBe("cwd");
    expect(result.resolution_scope_used).toBe("current_project");
  });

  it("should return none when the handle cannot be resolved anywhere", () => {
    const result = resolveHandleCandidatesService("UNKNOWN", "SKILLDOCU");

    expect(result.resolution_scope_used).toBe("none");
    expect(result.candidates).toHaveLength(0);
  });

  it("should ignore unrelated projects with missing roster during fallback search", () => {
    const result = resolveHandleCandidatesService("DATA", undefined, "C:\\dev\\common");

    expect(result.current_project_handle).toBe("COMMON");
    expect(result.current_project_source).toBe("cwd");
    expect(result.resolution_scope_used).toBe("global");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].project_handle).toBe("SOCIALUML");
  });

  it("should surface skipped_projects when a roster cannot be read during the global scan (SIMPLIFY #12)", () => {
    // LABY's roster throws FileOperationError in the mock; it must be
    // recorded in skipped_projects rather than silently dropped.
    const result = resolveHandleCandidatesService("DATA", "SKILLDOCU");

    expect(result.resolution_scope_used).toBe("global");
    expect(result.candidates).toHaveLength(1);
    expect(result.skipped_projects).toContain("LABY");
  });
});
