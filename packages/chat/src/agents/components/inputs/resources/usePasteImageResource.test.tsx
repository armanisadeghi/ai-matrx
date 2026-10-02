import { renderHook } from "@/test-utils/renderHook";

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

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppStore: () => ({ getState: () => state }),
}));

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload }),
}));

jest.mock(
  "@/features/agents/components/inputs/resources/attach-resource",
  () => ({
    useAttachResource: () => attachResource,
  }),
);

jest.mock("@/features/agents/redux/execution-system/utils/ids", () => ({
  generateResourceId: () => "resource-1",
}));

jest.mock("@/features/files/handler/input/normalize", () => ({
  normalize: () => ({ meta: { category: "DOCUMENT" }, url: null }),
}));

jest.mock("@/lib/toast", () => ({
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
