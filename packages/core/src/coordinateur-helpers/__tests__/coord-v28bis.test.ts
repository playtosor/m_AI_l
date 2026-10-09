// Unit tests for V2.8bis facade sync: 6 new coord_* wrappers around the
// V2.5-V2.7 core services. Lightweight mocks to keep the test fast.

jest.mock("../../index", () => ({
  listMessages: jest.fn(),
  countMessages: jest.fn(),
  ensureMailboxFiles: jest.fn(),
}));

import * as core from "../../index";
import {
  coord_list_mailbox_messages,
  coord_count_mailbox_messages,
  coord_ensure_mailbox_files,
} from "../index";
import type { MailboxRef, AgentRef } from "../types";

const mockListMessages = core.listMessages as jest.MockedFunction<typeof core.listMessages>;
const mockCountMessages = core.countMessages as jest.MockedFunction<typeof core.countMessages>;
const mockEnsureMailboxFiles = core.ensureMailboxFiles as jest.MockedFunction<typeof core.ensureMailboxFiles>;

const defaultMailbox: MailboxRef = { project_handle: "TEST", handle: "AGENT" };

function agentActor(handle: string, project_handle = "TEST"): AgentRef {
  return { kind: "agent", project_handle, handle };
}

describe("coord_list_mailbox_messages (pagination)", () => {
  it("delegates to listMessages and forwards result fields, including total and has_more", () => {
    mockListMessages.mockReturnValue({
      messages: [
        { sender: "A", timestamp: "20260101-0900", priority: "H", subject: "First", body: "" },
      ],
      total: 5,
      hasMore: true,
    });

    const result = coord_list_mailbox_messages({
      mailbox: defaultMailbox,
      source: "active",
      offset: 0,
      limit: 1,
    });

    expect(mockListMessages).toHaveBeenCalledWith({
      mailbox: defaultMailbox,
      source: "active",
      offset: 0,
      limit: 1,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.count).toBe(1); // count = messages.length (compat)
    expect(result.total).toBe(5);
    expect(result.has_more).toBe(true);
  });

  it("defaults source to 'active' and offset/limit to 0/50 when omitted", () => {
    mockListMessages.mockReturnValue({ messages: [], total: 0, hasMore: false });
    coord_list_mailbox_messages({ mailbox: defaultMailbox });

    expect(mockListMessages).toHaveBeenCalledWith({
      mailbox: defaultMailbox,
      source: "active",
      offset: 0,
      limit: 50,
    });
  });

  it("supports 'archive' source with pagination", () => {
    mockListMessages.mockReturnValue({ messages: [], total: 0, hasMore: false });
    coord_list_mailbox_messages({
      mailbox: defaultMailbox,
      source: "archive",
      offset: 5,
      limit: 10,
    });

    expect(mockListMessages).toHaveBeenCalledWith({
      mailbox: defaultMailbox,
      source: "archive",
      offset: 5,
      limit: 10,
    });
  });
});

describe("coord_count_mailbox_messages", () => {
  it("delegates to countMessages and returns count", () => {
    mockCountMessages.mockReturnValue({ count: 7 });

    const result = coord_count_mailbox_messages({
      mailbox: defaultMailbox,
      source: "active",
    });

    expect(mockCountMessages).toHaveBeenCalledWith({
      mailbox: defaultMailbox,
      source: "active",
    });
    expect(result.count).toBe(7);
    expect(result.source).toBe("active");
  });

  it("defaults source to 'active'", () => {
    mockCountMessages.mockReturnValue({ count: 0 });
    coord_count_mailbox_messages({ mailbox: defaultMailbox });

    expect(mockCountMessages).toHaveBeenCalledWith({
      mailbox: defaultMailbox,
      source: "active",
    });
  });
});

describe("coord_ensure_mailbox_files", () => {
  it("delegates to ensureMailboxFiles and forwards project_handle/handle/created", () => {
    mockEnsureMailboxFiles.mockReturnValue({ created: ["mailbox", "archive", "outbox"] });

    const result = coord_ensure_mailbox_files({
      project_handle: "TEST",
      handle: "AGENT",
    });

    expect(mockEnsureMailboxFiles).toHaveBeenCalledWith({
      project_handle: "TEST",
      handle: "AGENT",
    });
    expect(result.created).toEqual(["mailbox", "archive", "outbox"]);
  });
});
