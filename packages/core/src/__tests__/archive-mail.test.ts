import { archiveMail } from "../services/archive-mail";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { archiveMessagesAtPaths } from "../repositories/mailbox-repo";

jest.mock("../repositories/projects-repo");
jest.mock("../repositories/roster-repo");
jest.mock("../repositories/mailbox-repo");

describe("archiveMail", () => {
  const mockProject = { name: "TEST", path: "/test/project" };
  const mockRoster = [
    { handle: "AGENT1", role: "Worker", mailbox: "mailbox_AGENT1.md", status: "active" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getProject as jest.Mock).mockReturnValue(mockProject);
    (getRoster as jest.Mock).mockReturnValue(mockRoster);
   });

  describe("Cas nominaux", () => {
    it("archive tous les messages de la mailbox", () => {
      (archiveMessagesAtPaths as jest.Mock).mockReturnValue({
        messages: [],
        invalid_lines: [],
        warning_count: 0,
      });

      archiveMail("TEST", "AGENT1");

      expect(archiveMessagesAtPaths).toHaveBeenCalledWith(
        expect.stringContaining("mailbox_AGENT1.md"),
        expect.stringContaining("mailbox_AGENT1_archive.md")
      );
    });

    it("utilise mailbox_override si fourni", () => {
      (archiveMessagesAtPaths as jest.Mock).mockReturnValue({
        messages: [],
        invalid_lines: [],
        warning_count: 0,
      });

      archiveMail("TEST", "AGENT1", "/custom/mailbox.md");

      expect(archiveMessagesAtPaths).toHaveBeenCalledWith(
        "/custom/mailbox.md",
        expect.stringContaining("_archive")
      );
    });
  });

  describe("Propagation d'erreurs", () => {
    it("propage l'erreur si le projet n'existe pas", () => {
      const { ProjectNotFoundError } = require("../domain/errors");
      (getProject as jest.Mock).mockImplementation(() => {
        throw new ProjectNotFoundError("UNKNOWN");
      });

      expect(() => archiveMail("UNKNOWN", "AGENT1")).toThrow(ProjectNotFoundError);
    });

    it("propage l'erreur si le roster est introuvable", () => {
      const { FileOperationError } = require("../domain/errors");
      (getRoster as jest.Mock).mockImplementation(() => {
        throw new FileOperationError("Roster not found");
      });

      expect(() => archiveMail("TEST", "AGENT1")).toThrow(FileOperationError);
    });

    it("propage l'erreur si la mailbox n'existe pas", () => {
      const { FileOperationError } = require("../domain/errors");
      (archiveMessagesAtPaths as jest.Mock).mockImplementation(() => {
        throw new FileOperationError("Mailbox not found");
      });

      expect(() => archiveMail("TEST", "AGENT1")).toThrow(FileOperationError);
    });
  });
});