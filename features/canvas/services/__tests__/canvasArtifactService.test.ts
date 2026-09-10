const rpc = jest.fn();
// The write goes through `runWithSessionRetry` (@ai-matrx/data's session-retry
// primitive), which ASKS supabase-js for the session before it lets anything
// reach the database — an un-authenticated write is refused, never sent. A
// mock client without `auth.getSession` therefore never exercises the RPC at
// all; it exercises the service's catch block. Give the mock a real signed-in
// session so the test runs the path it is named for.
const getSession = jest.fn().mockResolvedValue({
  data: { session: { access_token: "test-token" } },
  error: null,
});

jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc, auth: { getSession } },
}));

jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: () => "00000000-0000-4000-8000-000000000001",
}));

import { canvasArtifactService } from "../canvasArtifactService";

describe("canvasArtifactService chat upserts", () => {
  beforeEach(() => {
    rpc.mockReset();
    getSession.mockClear();
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
