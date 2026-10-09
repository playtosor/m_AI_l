import { getProjects } from "../repositories/projects-repo";
import fs from "fs";
import path from "path";

jest.mock("../lib/paths", () => ({
  getProjectsPath: () => path.join(__dirname, "test_projects_config.md"),
}));

describe("projects-repo", () => {
  const projectsFile = path.join(__dirname, "test_projects_config.md");

  beforeEach(() => {
    if (fs.existsSync(projectsFile)) {
      fs.unlinkSync(projectsFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(projectsFile)) {
      fs.unlinkSync(projectsFile);
    }
  });

  it("should parse a markdown table with two columns", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project | Path |\n" +
      "|---------|------|\n" +
      "| DEMO | C:\\dev\\demo |\n"
    );

    const projects = getProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      name: "DEMO",
      path: "C:\\dev\\demo",
      roster: undefined,
      language: undefined,
      status: undefined,
    });
  });

  it("should parse the full project table and keep roster, language, and status", () => {
    fs.writeFileSync(
      projectsFile,
      "| Project handle | Absolute path | Roster | Language | Status |\n" +
      "|----------------|---------------|--------|----------|--------|\n" +
      "| SKILLDOCU | C:\\dev\\SKILLDOCU | C:\\dev\\SKILLDOCU\\roster.md | fr | active |\n"
    );

    const projects = getProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      name: "SKILLDOCU",
      path: "C:\\dev\\SKILLDOCU",
      roster: "C:\\dev\\SKILLDOCU\\roster.md",
      language: "fr",
      status: "active",
    });
  });
});
