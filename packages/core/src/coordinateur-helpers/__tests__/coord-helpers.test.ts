// Unit tests for coordinateur-helpers facade
// Mock core services to test facade in isolation

jest.mock("../../index", () => ({
  getProjects: jest.fn(),
  getRoster: jest.fn(),
  getMemberContext: jest.fn(),
  readMail: jest.fn(),
  readRecentArchive: jest.fn(),
  getOutbox: jest.fn(),
  writeMail: jest.fn(),
  editMail: jest.fn(),
  cancelMail: jest.fn(),
  archiveMessage: jest.fn(),
  deleteMessage: jest.fn(),
  bootstrapCommonMessaging: jest.fn(),
  createMessagingProject: jest.fn(),
  validateMessagingBootstrap: jest.fn(),
  upsertHandle: jest.fn(),
  archiveMail: jest.fn(),
  getPostCreateHookStatus: jest.fn(),
  runPostCreateHook: jest.fn(),
  listMessages: jest.fn(),
  countMessages: jest.fn(),
  ensureMailboxFiles: jest.fn(),
  deleteHandle: jest.fn(),
  renameHandle: jest.fn(),
}));

jest.mock("../../repositories/projects-repo", () => ({
  getProject: jest.fn(),
}));
jest.mock("../../repositories/roster-repo", () => ({
  getRoster: jest.fn(),
}));

import * as core from "../../index";
import * as projectsRepo from "../../repositories/projects-repo";
import * as rosterRepo from "../../repositories/roster-repo";

import {
  coord_list_projects,
  coord_list_project_handles,
  coord_list_mailbox_messages,
  coord_get_message_actions,
  coord_get_outbox,
  coord_send_message,
  coord_edit_message,
  coord_cancel_sent_message,
  coord_archive_message,
  coord_delete_message,
  coord_upsert_handle,
  coord_read_recent_archive,
} from "../index";

import type { HumanRef, AgentRef, RecipientRef, MailboxRef, MessageRef } from "../types";
import { HUMAN_HANDLE } from "../../domain/constants";

const mockGetProjects = core.getProjects as jest.MockedFunction<typeof core.getProjects>;
const mockGetRoster = core.getRoster as jest.MockedFunction<typeof core.getRoster>;
const mockGetMemberContext = core.getMemberContext as jest.MockedFunction<typeof core.getMemberContext>;
const mockReadMail = core.readMail as jest.MockedFunction<typeof core.readMail>;
const mockListMessages = core.listMessages as jest.MockedFunction<typeof core.listMessages>;
const mockReadRecentArchive = core.readRecentArchive as jest.MockedFunction<typeof core.readRecentArchive>;
const mockGetOutbox = core.getOutbox as jest.MockedFunction<typeof core.getOutbox>;
const mockWriteMail = core.writeMail as jest.MockedFunction<typeof core.writeMail>;
const mockEditMail = core.editMail as jest.MockedFunction<typeof core.editMail>;
const mockCancelMail = core.cancelMail as jest.MockedFunction<typeof core.cancelMail>;
const mockArchiveMessage = core.archiveMessage as jest.MockedFunction<typeof core.archiveMessage>;
const mockDeleteMessage = core.deleteMessage as jest.MockedFunction<typeof core.deleteMessage>;
const mockUpsertHandle = core.upsertHandle as jest.MockedFunction<typeof core.upsertHandle>;
const mockGetProject = projectsRepo.getProject as jest.MockedFunction<typeof projectsRepo.getProject>;
const mockGetRosterRepo = rosterRepo.getRoster as jest.MockedFunction<typeof rosterRepo.getRoster>;

describe("coordinateur-helpers facade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 2: coord_list_projects
  describe("coord_list_projects", () => {
    it("filters out inactive projects when include_inactive is false", () => {
      mockGetProjects.mockReturnValue([
        { name: "PROJ1", path: "/proj1", roster: "roster.md", language: "fr", status: "active" },
        { name: "PROJ2", path: "/proj2", roster: "roster.md", language: "fr", status: "inactive" },
      ]);
      const result = coord_list_projects({ include_inactive: false });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].project_handle).toBe("PROJ1");
    });

    it("includes inactive projects when include_inactive is true", () => {
      mockGetProjects.mockReturnValue([
        { name: "PROJ1", path: "/proj1", roster: "roster.md", language: "fr", status: "active" },
        { name: "PROJ2", path: "/proj2", roster: "roster.md", language: "fr", status: "inactive" },
      ]);
      const result = coord_list_projects({ include_inactive: true });
      expect(result.projects).toHaveLength(2);
    });
  });

  // Test 6: coord_list_mailbox_messages
  describe("coord_list_mailbox_messages", () => {
    it("reads from active mailbox when source is active", () => {
      mockListMessages.mockReturnValue({
        messages: [{ sender: "AGENT1", timestamp: "20260505-0000", priority: "M" as const, subject: "Test", body: "Body" }],
        total: 1,
        hasMore: false,
      });
      const result = coord_list_mailbox_messages({
        mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
        source: "active",
      });
      expect(result.source).toBe("active");
      expect(result.count).toBe(1);
    });

    it("reads from archive when source is archive", () => {
      mockListMessages.mockReturnValue({
        messages: [{ sender: "AGENT2", timestamp: "20260505-0000", priority: "M" as const, subject: "Old", body: "Old body" }],
        total: 1,
        hasMore: false,
      });
      const result = coord_list_mailbox_messages({
        mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
        source: "archive",
      });
      expect(result.source).toBe("archive");
      expect(result.count).toBe(1);
    });
  });

  // Test 7: coord_get_message_actions
  describe("coord_get_message_actions", () => {
    it("allows human actor to archive own mailbox (HUMAN)", () => {
      const actor: HumanRef = { kind: "human", handle: HUMAN_HANDLE };
      const message: MessageRef = {
        mailbox: { project_handle: "COMMON", handle: HUMAN_HANDLE },
        sender: "AGENT1",
        timestamp: "20260505-0000",
        subject: "Test",
      };
      const result = coord_get_message_actions({ actor, message });
      expect(result.can_archive).toBe(true);
    });

    it("denies human actor to archive other mailboxes", () => {
      const actor: HumanRef = { kind: "human", handle: HUMAN_HANDLE };
      const message: MessageRef = {
        mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
        sender: "AGENT1",
        timestamp: "20260505-0000",
        subject: "Test",
      };
      const result = coord_get_message_actions({ actor, message });
      expect(result.can_archive).toBe(false);
    });

    it("allows agent actor to archive own mailbox", () => {
      const actor: AgentRef = { kind: "agent", project_handle: "PROJ1", handle: "AGENT1" };
      const message: MessageRef = {
        mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
        sender: "AGENT2",
        timestamp: "20260505-0000",
        subject: "Test",
      };
      const result = coord_get_message_actions({ actor, message });
      expect(result.can_archive).toBe(true);
    });

    it("does not throw for non-HUMAN mailbox", () => {
      const actor: AgentRef = { kind: "agent", project_handle: "PROJ1", handle: "AGENT1" };
      const message: MessageRef = {
        mailbox: { project_handle: "PROJ1", handle: "AGENT2" },
        sender: "AGENT3",
        timestamp: "20260505-0000",
        subject: "Test",
      };
      expect(() => coord_get_message_actions({ actor, message })).not.toThrow();
      const result = coord_get_message_actions({ actor, message });
      expect(result.can_archive).toBe(false);
      expect(result.can_read).toBe(true);
      expect(result.can_edit).toBe(true);
    });
  });

// Test 8: coord_send_message
describe("coord_send_message", () => {
  it("sends message for human sender", () => {
    mockWriteMail.mockReturnValue({ effectiveSender: HUMAN_HANDLE, timestamp: "20260101-0000", outboxWriteFailed: false });
    const result = coord_send_message({
      sender: { kind: "human", handle: HUMAN_HANDLE },
      recipient: { kind: "handle" as const, project_handle: "PROJ1", handle: "AGENT1" },
      priority: "M",
      subject: "Test",
      body: "Body",
    });
    expect(result.status).toBe("sent");
  });

  it("sends message for agent sender with empty project_handle using recipient's project", () => {
    mockWriteMail.mockReturnValue({ effectiveSender: "AGENT_X", timestamp: "20260101-0000", outboxWriteFailed: false });
    const result = coord_send_message({
      sender: { kind: "agent", project_handle: "", handle: "AGENT_X" },
      recipient: { kind: "handle" as const, project_handle: "PROJ1", handle: "AGENT1" },
      priority: "M",
      subject: "Test",
      body: "Body",
    });
    expect(result.status).toBe("sent");
    expect(mockWriteMail).toHaveBeenCalledWith(
      "PROJ1",
      "AGENT_X",
      "AGENT1",
      "M",
      "Test",
      "Body",
      undefined,
      ""
    );
  });

  it("sends message for agent sender with defined project_handle", () => {
    mockWriteMail.mockReturnValue({ effectiveSender: "AGENT_Y", timestamp: "20260101-0000", outboxWriteFailed: false });
    const result = coord_send_message({
      sender: { kind: "agent", project_handle: "PROJ1", handle: "AGENT_Y" },
      recipient: { kind: "handle" as const, project_handle: "PROJ1", handle: "AGENT1" },
      priority: "H",
      subject: "Important",
      body: "Message",
    });
    expect(result.status).toBe("sent");
    expect(mockWriteMail).toHaveBeenCalledWith(
      "PROJ1",
      "AGENT_Y",
      "AGENT1",
      "H",
      "Important",
      "Message",
      undefined,
      "PROJ1"
    );
  });
});

  // Test 9: coord_edit_message and coord_cancel_sent_message
  describe("coord_edit_message", () => {
    it("edits a message", () => {
      mockEditMail.mockReturnValue({
        mode: "correction_sent" as const,
        previous: null,
        message: { sender: "AGENT1", timestamp: "20260505-0000", priority: "M" as const, subject: "New", body: "New" },
      });
      const result = coord_edit_message({
        actor: { kind: "agent" as const, project_handle: "PROJ1", handle: "AGENT1" },
        message: {
          mailbox: { project_handle: "PROJ1", handle: "AGENT2" },
          sender: "AGENT1",
          timestamp: "20260505-0000",
          subject: "Old",
        },
        patch: { new_subject: "New" },
      });
      expect(result.status).toBe("correction_sent");
    });
  });

  describe("coord_cancel_sent_message", () => {
    it("cancels a sent message", () => {
      mockCancelMail.mockReturnValue({
        sender: "AGENT1",
        timestamp: "20260505-0000",
        priority: "M" as const,
        subject: "Test",
        body: "Body",
      });
      const result = coord_cancel_sent_message({
        actor: { kind: "agent" as const, project_handle: "PROJ1", handle: "AGENT1" },
        message: {
          mailbox: { project_handle: "PROJ1", handle: "AGENT2" },
          sender: "AGENT1",
          timestamp: "20260505-0000",
          subject: "Test",
        },
      });
      expect(result.status).toBe("cancelled");
    });
  });

  // Test 10: coord_archive_message and coord_delete_message
  describe("coord_archive_message", () => {
    it("archives a message", () => {
      mockArchiveMessage.mockReturnValue({
        status: "archived" as const,
        archived_message: {
          sender: "AGENT1",
          timestamp: "20260505-0000",
          priority: "M" as const,
          subject: "Test",
          body: "Body",
        },
      });
      const result = coord_archive_message({
        actor: { kind: "agent" as const, project_handle: "PROJ1", handle: "AGENT1" },
        message: {
          mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
          sender: "AGENT2",
          timestamp: "20260505-0000",
          subject: "Test",
        },
      });
      expect(result.status).toBe("archived");
    });

    it("archives a message sent with qualified same-project sender PROJ/HANDLE", () => {
      mockArchiveMessage.mockReturnValue({
        status: "archived" as const,
        archived_message: {
          sender: "AGENT2",
          timestamp: "20260505-0000",
          priority: "M" as const,
          subject: "Test",
          body: "Body",
        },
      });
      const result = coord_archive_message({
        actor: { kind: "agent" as const, project_handle: "PROJ1", handle: "AGENT1" },
        message: {
          mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
          sender: "PROJ1/AGENT2",
          timestamp: "20260505-0000",
          subject: "Test",
        },
      });
      expect(result.status).toBe("archived");
      // The facade must split the qualified sender into bare handle +
      // senderProjectHandle so the core archive lookup matches the
      // normalized (bare) sender stored at write time.
      expect(mockArchiveMessage).toHaveBeenCalledWith(
        "PROJ1",
        "AGENT1",
        "AGENT2",
        "20260505-0000",
        "Test",
        "PROJ1",
        undefined
      );
    });
  });

  describe("coord_delete_message", () => {
    it("deletes a message", () => {
      mockDeleteMessage.mockReturnValue({
        status: "deleted" as const,
        deleted_message: {
          sender: "AGENT1",
          timestamp: "20260505-0000",
          priority: "M" as const,
          subject: "Test",
          body: "Body",
        },
      });
      const result = coord_delete_message({
        actor: { kind: "agent" as const, project_handle: "PROJ1", handle: "AGENT1" },
        message: {
          mailbox: { project_handle: "PROJ1", handle: "AGENT1" },
          sender: "AGENT2",
          timestamp: "20260505-0000",
          subject: "Test",
        },
      });
      expect(result.status).toBe("deleted");
    });
  });

  // Test 12: coord_upsert_handle
  describe("coord_upsert_handle", () => {
    it("upserts a handle", () => {
      mockUpsertHandle.mockReturnValue({
        status: "created" as const,
        project_handle: "PROJ1",
        handle: "NEWAGENT",
        role: "dev",
        mailbox: "mailbox_NEWAGENT.md",
        roster_status: "active",
      });
      const result = coord_upsert_handle({
        project_handle: "PROJ1",
        handle: "NEWAGENT",
        role: "dev",
      });
      expect(result.status).toBe("created");
    });
  });

  // ---- Non-regression tests for non-HUMAN mailbox bug fix ----

  describe("non-regression: coord_get_message_actions on non-HUMAN mailbox", () => {
    it("computes actions without throwing for PROJET/HANDLE mailbox", () => {
      const actor: AgentRef = { kind: "agent", project_handle: "MAILEXPORT", handle: "EXEC" };
      const message: MessageRef = {
        mailbox: { project_handle: "MAILEXPORT", handle: "EXEC" },
        sender: "REVIEWER",
        timestamp: "20260515-1200",
        subject: "Test",
      };
      expect(() => coord_get_message_actions({ actor, message })).not.toThrow();
      const result = coord_get_message_actions({ actor, message });
      expect(result.can_archive).toBe(true);
      expect(result.can_read).toBe(true);
      expect(result.can_edit).toBe(true);
      expect(result.can_delete).toBe(false);
    });

    it("denies archive for agent on different mailbox", () => {
      const actor: AgentRef = { kind: "agent", project_handle: "MAILEXPORT", handle: "EXEC" };
      const message: MessageRef = {
        mailbox: { project_handle: "MAILEXPORT", handle: "REVIEWER" },
        sender: "EXEC",
        timestamp: "20260515-1200",
        subject: "Test",
      };
      const result = coord_get_message_actions({ actor, message });
      expect(result.can_archive).toBe(false);
    });
  });

  describe("non-regression: PROJET/HANDLE mailbox actions remain computable", () => {
    it("returns full action set for agent viewing own mailbox message", () => {
      const actor: AgentRef = { kind: "agent", project_handle: "MAILEXPORT", handle: "EXEC" };
      const message: MessageRef = {
        mailbox: { project_handle: "MAILEXPORT", handle: "EXEC" },
        sender: "EXPORT",
        timestamp: "20260515-2138",
        subject: "BRIEF valide",
      };
      const result = coord_get_message_actions({ actor, message });
      expect(result).toEqual({
        can_read: true,
        can_archive: true,
        can_delete: false,
        can_edit: true,
        can_change_sender: false,
        edit_mode: "in_place_or_correction",
      });
    });
  });

  describe("coord_list_project_handles - roster absent", () => {
    it("returns empty handles when roster.md is missing", () => {
      mockGetProject.mockReturnValue({ name: "LABYCHRONO", path: "/laby", roster: "roster.md", language: "fr", status: "active" });
      mockGetRosterRepo.mockImplementation(() => {
        throw new Error("Roster file not found");
      });
      const result = coord_list_project_handles("LABYCHRONO", {
        include_inactive: false,
      });
      expect(result).toEqual({ project_handle: "LABYCHRONO", handles: [] });
    });

    it("does not throw when roster.md is missing", () => {
      mockGetProject.mockReturnValue({ name: "LABYCHRONO", path: "/laby", roster: "roster.md", language: "fr", status: "active" });
      mockGetRosterRepo.mockImplementation(() => {
        throw new Error("Roster file not found");
      });
      expect(() => coord_list_project_handles("LABYCHRONO")).not.toThrow();
    });

    it("returns empty handles when project does not exist", () => {
      mockGetProject.mockImplementation(() => {
        throw new Error("Project not found");
      });
      const result = coord_list_project_handles("UNKNOWN");
      expect(result).toEqual({ project_handle: "UNKNOWN", handles: [] });
    });
  });

  describe("non-regression: coord_list_project_handles on valid non-HUMAN project", () => {
    it("resolves handles via getProject + getRosterRepo for non-HUMAN project", () => {
      mockGetProject.mockReturnValue({
        name: "MAILEXPORT",
        path: "C:\\dev\\m_AI_l_EXPORT",
        roster: "roster.md",
        language: "fr",
        status: "active",
      });
      mockGetRosterRepo.mockReturnValue([
        { handle: "EXEC", role: "developer", mailbox: "mailbox_EXEC.md", status: "active" },
        { handle: "REVIEWER", role: "reviewer", mailbox: "mailbox_REVIEWER.md", status: "active" },
      ]);
      const result = coord_list_project_handles("MAILEXPORT");
      expect(result.project_handle).toBe("MAILEXPORT");
      expect(result.handles).toHaveLength(2);
      expect(result.handles[0].handle).toBe("EXEC");
      expect(result.handles[0].is_human).toBe(false);
      expect(mockGetProject).toHaveBeenCalledWith("MAILEXPORT");
      expect(mockGetRosterRepo).toHaveBeenCalledWith("C:\\dev\\m_AI_l_EXPORT", "roster.md");
    });
  });
});
