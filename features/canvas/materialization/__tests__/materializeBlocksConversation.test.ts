const upsertForSource = jest.fn();
const upsertDiscoveryIndex = jest.fn();
const setExternalLink = jest.fn();
const isReadableById = jest.fn();

jest.mock("@/features/canvas/services/canvasArtifactService", () => ({
  canvasArtifactService: {
    upsertForSource,
    upsertDiscoveryIndex,
    setExternalLink,
    isReadableById,
  },
}));

import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { materializeBlocks } from "../materializeBlocks";

describe("materializeBlocks conversation identity", () => {
  beforeEach(() => {
    upsertForSource.mockReset();
    upsertDiscoveryIndex.mockReset();
    setExternalLink.mockReset();
    isReadableById.mockReset();
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

  it("rebuilds a dangling UUID ref from its durable wire body", async () => {
    const missingCanvasId = "00000000-0000-4000-8000-000000000021";
    const replacementCanvasId = "00000000-0000-4000-8000-000000000022";
    isReadableById.mockResolvedValue(false);
    upsertForSource.mockResolvedValue({
      id: replacementCanvasId,
      version: 1,
      conversation_id: "00000000-0000-4000-8000-000000000023",
    });
    upsertDiscoveryIndex.mockResolvedValue({ id: "discovery-row" });
    const persistRewrite = jest.fn().mockResolvedValue({ ok: true });

    const result = await materializeBlocks({
      source: {
        system: "cx_message",
        id: "00000000-0000-4000-8000-000000000020",
      },
      content: [
        {
          type: "text",
          text: `<artifact type="mermaid" id="${missingCanvasId}" version="1" title="Recovered flow">\nflowchart TD\n  A --> B\n</artifact>`,
        } as CxContentBlock,
      ],
      persistRewrite,
    });

    expect(isReadableById).toHaveBeenCalledWith(missingCanvasId);
    expect(upsertForSource).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactIndex: 1,
        type: "mermaid",
        content: "flowchart TD\n  A --> B",
      }),
    );
    expect(persistRewrite).toHaveBeenCalledWith([
      expect.objectContaining({
        text: expect.stringContaining(`id="${replacementCanvasId}"`),
      }),
    ]);
    expect(result.materializedCount).toBe(1);
  });
});
