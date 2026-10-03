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

describe("canvasArtifactService.readVersionHistory — owner rows only", () => {
  beforeEach(() => rpc.mockReset());

  const OWNER = "00000000-0000-4000-8000-0000000000aa";
  const STRANGER = "00000000-0000-4000-8000-0000000000bb";
  const chain = [
    { id: "root", user_id: OWNER, parent_canvas_id: null, version: 1 },
    { id: "v2", user_id: OWNER, parent_canvas_id: "root", version: 2 },
    // Another person inserted their own (public) row into this chain.
    { id: "planted", user_id: STRANGER, parent_canvas_id: "root", version: 999 },
  ];

  it("drops a row another person planted in the chain, from any entry id", async () => {
    rpc.mockResolvedValue({ data: chain, error: null });
    for (const entry of ["root", "v2", "planted"]) {
      const rows = await canvasArtifactService.readVersionHistory(entry);
      expect(rows.map((r) => r.id)).toEqual(["root", "v2"]);
    }
    expect(rpc).toHaveBeenCalledWith("cx_canvas_get_version_history", { p_canvas_id: "root" });
  });

  it("every chain reader through getVersionHistory sees the owner's newest version, never the planted one", async () => {
    rpc.mockResolvedValue({ data: chain, error: null });
    const rows = await canvasArtifactService.getVersionHistory("root");
    const latest = rows.reduce((a, b) => (b.version > a.version ? b : a));
    expect(latest.id).toBe("v2");
  });

  it("keeps the chain as read when the rows carry no owner (nothing to compare)", async () => {
    const anon = chain.map(({ user_id: _u, ...rest }) => rest);
    rpc.mockResolvedValue({ data: anon, error: null });
    const rows = await canvasArtifactService.readVersionHistory("root");
    expect(rows).toHaveLength(3);
  });
});
