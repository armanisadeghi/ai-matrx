import { renderHook } from "@ai-matrx/chat/host/__tests__/render-hook";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";

const upload = jest.fn();
const attachResource = jest.fn();
const dispatch = jest.fn();
const conversationId = "conversation-1";
const organizationId = "organization-1";

const state = {
  conversations: {
    byConversationId: {
      [conversationId]: {
        cacheOnly: false,
        organizationId,
      },
    },
  },
  instanceResources: {
    byConversationId: {
      [conversationId]: { "resource-1": {} },
    },
  },
};

jest.mock("../../../../store/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppStore: () => ({ getState: () => state }),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../store/hooks"));

// The host registers its upload hook (P16f slot); this test registers the double.
beforeEach(() => registerChatUi({ useFileUpload: () => ({ upload }) }));

jest.mock(
  "./attach-resource",
  () => ({
    useAttachResource: () => attachResource,
  }),
);

jest.mock("../../../redux/execution-system/utils/ids", () => ({
  generateResourceId: () => "resource-1",
}));

jest.mock("@host/features/files/handler/input/normalize", () => ({
  normalize: () => ({ meta: { category: "DOCUMENT" }, url: null }),
}));

jest.mock("../../../../host/notify", () => ({
  toast: { error: jest.fn() },
}));

import { useUploadAgentResources } from "./usePasteImageResource";

describe("useUploadAgentResources", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upload.mockResolvedValue({
      fileId: "file-1",
      url: "https://files.example/file-1",
      meta: { mime: "text/plain" },
    });
    attachResource.mockResolvedValue(true);
  });

  it("stamps the conversation organization onto local attachment uploads", async () => {
    const hook = await renderHook(() =>
      useUploadAgentResources(conversationId),
    );
    const file = new File(["hello"], "note.txt", { type: "text/plain" });

    await hook.act(() => hook.current([file]));

    expect(upload).toHaveBeenCalledWith(
      { kind: "file", file },
      expect.objectContaining({
        visibility: "personal",
        metadata: {
          scope: { organization_id: organizationId },
        },
      }),
    );
    expect(attachResource).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "file",
        data: expect.objectContaining({ id: "file-1" }),
      }),
    );
    await hook.unmount();
  });
});
