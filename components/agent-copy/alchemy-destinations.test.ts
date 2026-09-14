jest.mock("@/lib/redux/slices/userSlice", () => ({ selectUserId: (state: { userId?: string }) => state.userId }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: (state: { organizationId?: string }) => state.organizationId }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: (payload: unknown) => ({ type: "overlay/open", payload }) }));
jest.mock("@/features/tasks/redux/taskUiSlice", () => ({ setPendingSource: (payload: unknown) => ({ type: "task/pending", payload }) }));
jest.mock("@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice", () => ({ clearFocus: (payload: unknown) => ({ type: "focus/clear", payload }) }));
jest.mock("@/features/agents/redux/chat/chat-route.slice", () => ({ bumpFreshSession: () => ({ type: "chat/bump" }) }));
jest.mock("@/features/agents/components/chat/begin-fresh-chat", () => ({ chatRouteSurfaceKey: (id: string) => `surface:${id}` }));
jest.mock("@/features/agents/components/chat/chat-quick-actions.config", () => ({ DEFAULT_NEW_CHAT_MANDATE_KEY: "default-mandate" }));
jest.mock("@/features/mandates/service", () => ({ resolveMandate: jest.fn() }));
jest.mock("@/features/data-tables/export-targets", () => ({ pushMarkdownToDocument: jest.fn(), pushTableToWorkbook: jest.fn() }));

import { consumeChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";
import { resolveMandate } from "@/features/mandates/service";
import { pushMarkdownToDocument } from "@/features/data-tables/export-targets";
import { createAlchemyDestinationPorts } from "./alchemy-destinations";

const signal = new AbortController().signal;
const content = {
  label: "Prepared content",
  markdown: "First line\n\nSecond line — exact bytes.",
  plainText: "First line\n\nSecond line — exact bytes.",
  signal,
  draft: { sourceId: "source-1" },
} as never;

describe("Alchemy destination ports", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
    jest.mocked(resolveMandate).mockResolvedValue({ agentId: "agent-42" } as never);
  });

  function host(getCurrentState = () => ({ userId: "user-1", organizationId: "org-1" })) {
    return {
      getCurrentState: jest.fn(getCurrentState),
      dispatch: jest.fn(),
      navigate: jest.fn(),
    } as Parameters<typeof createAlchemyDestinationPorts>[0] & {
      getCurrentState: jest.Mock;
      dispatch: jest.Mock;
      navigate: jest.Mock;
    };
  }

  it("opens a new chat with exact source bytes as a resource and no drafted prompt", async () => {
    const currentHost = host();
    await createAlchemyDestinationPorts(currentHost).chat(content);

    expect(currentHost.navigate).toHaveBeenCalledWith("/chat/new");
    expect(consumeChatDraftTransfer("agent-42", { userId: "user-1", organizationId: "org-1" })).toEqual(expect.objectContaining({
      text: "",
      resources: [expect.objectContaining({ type: "text", data: expect.objectContaining({ label: "Prepared content", text: "First line\n\nSecond line — exact bytes." }) })],
    }));
  });

  it("opens an assistant with an attached resource and explicitly disables auto-run", async () => {
    const currentHost = host();
    await createAlchemyDestinationPorts(currentHost).assistant(content);

    expect(currentHost.navigate).not.toHaveBeenCalled();
    expect(currentHost.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ data: expect.objectContaining({
        initialAutoRun: false,
        initialResources: [expect.objectContaining({ data: expect.objectContaining({ text: "First line\n\nSecond line — exact bytes." }) })],
      }) }),
    }));
  });

  it("does not navigate when identity validation fails after mandate resolution", async () => {
    const currentHost = host();
    jest.mocked(resolveMandate).mockImplementation(async () => {
      currentHost.getCurrentState.mockImplementation(() => { throw new Error("account changed"); });
      return { agentId: "agent-42" } as never;
    });

    await expect(createAlchemyDestinationPorts(currentHost).chat(content)).rejects.toThrow("account changed");
    expect(currentHost.navigate).not.toHaveBeenCalled();
    expect(currentHost.dispatch).not.toHaveBeenCalled();
  });

  it("returns the created document target when its snapshot save partially fails", async () => {
    jest.mocked(pushMarkdownToDocument).mockResolvedValue({
      ok: false,
      id: "document-42",
      href: "/documents/document-42",
      error: "Document was created, but its initial content could not be saved. do not create another copy.",
    });

    await expect(createAlchemyDestinationPorts(host()).document(content)).resolves.toEqual(expect.objectContaining({
      status: "error",
      target: { kind: "document", id: "document-42", label: "Prepared content", href: "/documents/document-42" },
      message: expect.stringMatching(/created.*do not create another copy/i),
    }));
  });
});
