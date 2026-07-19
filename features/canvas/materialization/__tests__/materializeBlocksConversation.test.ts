const upsertForSource = jest.fn();
const upsertDiscoveryIndex = jest.fn();
const setExternalLink = jest.fn();

jest.mock("@/features/canvas/services/canvasArtifactService", () => ({
  canvasArtifactService: {
    upsertForSource,
    upsertDiscoveryIndex,
    setExternalLink,
  },
}));

import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { materializeBlocks } from "../materializeBlocks";

describe("materializeBlocks conversation identity", () => {
  beforeEach(() => {
    upsertForSource.mockReset();
    upsertDiscoveryIndex.mockReset();
    setExternalLink.mockReset();
  });

  it("uses the canvas row's server conversation for chat discovery writes", async () => {
    const messageId = "00000000-0000-4000-8000-000000000010";
    const localConversationId = "00000000-0000-4000-8000-000000000011";
    const serverConversationId = "00000000-0000-4000-8000-000000000012";
    const canvasId = "00000000-0000-4000-8000-000000000013";

    upsertForSource.mockResolvedValue({
      id: canvasId,
      version: 1,
      conversation_id: serverConversationId,
    });
    upsertDiscoveryIndex.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000014",
    });
    const persistRewrite = jest.fn().mockResolvedValue({ ok: true });

    const content = [
      {
        type: "text",
        text: "```mermaid\nflowchart TD\n  A --> B\n```",
      } as CxContentBlock,
    ];

    const result = await materializeBlocks({
      source: {
        system: "cx_message",
        id: messageId,
        conversationId: localConversationId,
      },
      content,
      persistRewrite,
    });

    expect(result.errors).toEqual([]);
    expect(upsertDiscoveryIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasId,
        source: { system: "cx_message", id: messageId },
        conversationId: serverConversationId,
      }),
    );
    expect(upsertDiscoveryIndex).not.toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: localConversationId }),
    );
    expect(persistRewrite).toHaveBeenCalledTimes(1);
  });
});
