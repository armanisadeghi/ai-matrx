const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc },
}));

jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "00000000-0000-4000-8000-000000000001",
}));

import { canvasArtifactService } from "../canvasArtifactService";

describe("canvasArtifactService chat upserts", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("lets the persisted message resolve its conversation instead of forwarding a local UI id", async () => {
    const messageId = "00000000-0000-4000-8000-000000000002";
    const serverConversationId = "00000000-0000-4000-8000-000000000003";

    rpc.mockResolvedValue({
      data: {
        id: "00000000-0000-4000-8000-000000000004",
        conversation_id: serverConversationId,
      },
      error: null,
    });

    const result = await canvasArtifactService.upsertForSource({
      source: { system: "cx_message", id: messageId },
      artifactIndex: 1,
      type: "table",
      title: "Result",
      content: "| A |\n| - |\n| 1 |",
      conversationId: "00000000-0000-4000-8000-000000000099",
    });

    expect(rpc).toHaveBeenCalledWith("cx_canvas_upsert", {
      p_user_id: "00000000-0000-4000-8000-000000000001",
      p_message_id: messageId,
      p_artifact_index: 1,
      p_type: "table",
      p_title: "Result",
      p_content: {
        data: "| A |\n| - |\n| 1 |",
        type: "table",
        metadata: {},
      },
      p_source_type: "model_direct",
    });
    expect(result?.conversation_id).toBe(serverConversationId);
  });
});
