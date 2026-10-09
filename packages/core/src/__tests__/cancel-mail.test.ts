import { cancelMail } from "../services/cancel-mail";
import { getProject } from "../repositories/projects-repo";
import { getRoster } from "../repositories/roster-repo";
import { removeMessageFromPath } from "../repositories/mailbox-repo";
import { MessageNotFoundError, RosterEntryNotFoundError, RosterEntryInactiveError } from "../domain/errors";

jest.mock("../repositories/projects-repo");
jest.mock("../repositories/roster-repo");
jest.mock("../repositories/mailbox-repo");
jest.mock("../lib/lock", () => ({
  withFileLock: (_path: string, _op: string, cb: () => unknown) => cb(),
}));

describe("cancelMail", () => {
  const mockProject = { name: "TEST", path: "/test/project" };
  const mockRster = [
    { handle: "AGENT1", role: "Worker", mailbox: "mailbox_AGENT1.md", status: "active" },
    { handle: "AGENT2", role: "Worker", mailbox: "mailbox_AGENT2.md", status: "inactive" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getProject as jest.Mock).mockReturnValue(mockProject);
    (getRoster as jest.Mock).mockReturnValue(mockRster);
  });

  describe("Cas nominaux", () => {
    it("supprime un message existant et retourne le message supprimé", () => {
      const mockMessage = { sender: "SENDER", timestamp: "20250113-1200", priority: "H" as const, subject: "Test subject", body: "Test body" };
      (removeMessageFromPath as jest.Mock).mockReturnValue(mockMessage);
      const result = cancelMail("TEST", "SENDER", "AGENT1", "20250113-1200", "Test subject");
      expect(result).toEqual(mockMessage);
      expect(removeMessageFromPath).toHaveBeenCalledWith(
        expect.stringContaining("mailbox_AGENT1.md"),
        expect.objectContaining({ sender: "SENDER", timestamp: "20250113-1200", subject: "Test subject" })
      );
    });

    it("sanititize le subject avant recherche", () => {
      const mockMessage = { sender: "S", timestamp: "t", priority: "M" as const, subject: "s", body: "b" };
      (removeMessageFromPath as jest.Mock).mockReturnValue(mockMessage);
      cancelMail("TEST", "SENDER", "AGENT1", "20250113-1200", "Test <!-- END --> subject");
      expect(removeMessageFromPath).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ subject: "Test (((END))) subject" })
      );
    });
  });

  describe("Erreurs métier", () => {
    it("lève RosterEntryNotFoundError si le recipient n'existe pas", () => {
      expect(() => cancelMail("TEST", "SENDER", "UNKNOWN", "20250113-1200", "Subject"))
        .toThrow(RosterEntryNotFoundError);
    });

    it("lève RosterEntryInactiveError si le recipient est inactif", () => {
      expect(() => cancelMail("TEST", "SENDER", "AGENT2", "20250113-1200", "Subject"))
        .toThrow(RosterEntryInactiveError);
    });

    it("lève MessageNotFoundError si aucun message ne correspond", () => {
      (removeMessageFromPath as jest.Mock).mockReturnValue(null);
      expect(() => cancelMail("TEST", "SENDER", "AGENT1", "20250113-1200", "Subject"))
        .toThrow(MessageNotFoundError);
    });
  });

  describe("Paramètres optionnels", () => {
    it("utilise mailbox_override si fourni", () => {
      const mockMessage = { sender: "S", timestamp: "t", priority: "M" as const, subject: "s", body: "b" };
      (removeMessageFromPath as jest.Mock).mockReturnValue(mockMessage);
      cancelMail("TEST", "SENDER", "AGENT1", "20250113-1200", "Subject", "/custom/mailbox.md");
      expect(removeMessageFromPath).toHaveBeenCalledWith(
        "/custom/mailbox.md",
        expect.any(Object)
      );
    });
  });

  describe("Inter-project signature", () => {
    it("should find and remove a message stored with PROJECT/HANDLE sender when sender_project_handle is provided", () => {
      const mockMessage = { sender: "MAILEXPORT/ARCHI", timestamp: "20260422-1301", priority: "M" as const, subject: "Inter subject", body: "Inter body" };
      (removeMessageFromPath as jest.Mock).mockReturnValue(mockMessage);
      const result = cancelMail("TEST", "ARCHI", "AGENT1", "20260422-1301", "Inter subject", undefined, "MAILEXPORT");
      expect(result).toEqual(mockMessage);
      expect(removeMessageFromPath).toHaveBeenCalledWith(
        expect.stringContaining("mailbox_AGENT1.md"),
        expect.objectContaining({ sender: "MAILEXPORT/ARCHI", timestamp: "20260422-1301", subject: "Inter subject" })
      );
    });
  });
});
