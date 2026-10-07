// A signed-out visitor's run (a published Applet at /p/<slug>) must never read
// `chat.message`: anon holds no grant, so every read was a 42501, and the bounded
// durable-read loop repeated it eight times per run. A refusal is not lag.
const mockMaybeSingle = jest.fn();
const chain: Record<string, unknown> = {};
for (const m of ["from", "select", "eq", "is"]) chain[m] = jest.fn(() => chain);
chain.maybeSingle = mockMaybeSingle;
const mockSchema = jest.fn(() => chain);
jest.mock("../../../../../host/db", () => ({ supabase: { schema: mockSchema } }));
const mockSignedOut = jest.fn();
jest.mock("../../../../../host/identity", () => ({ isSignedOutVisitor: () => mockSignedOut() }));

import { refetchSingleMessage } from "../refetch-single-message.thunk";

const ID = "b8c8126d-b17b-4684-a25b-d408e38fdafc";
const run = (waitForReadable: boolean) =>
  refetchSingleMessage({ conversationId: "c1", messageId: ID, waitForReadable })(
    jest.fn() as never,
    (() => ({ messages: { byConversationId: {} } })) as never,
    undefined,
  );

describe("refetchSingleMessage", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockSchema.mockClear();
    mockSignedOut.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("a signed-out visitor makes no read at all", async () => {
    mockSignedOut.mockResolvedValue(true);
    const out = await run(true);
    expect(mockSchema).not.toHaveBeenCalled();
    expect(out.payload).toMatchObject({ found: false, refreshed: false });
  });

  it("a refused read is not retried", async () => {
    mockSignedOut.mockResolvedValue(false);
    mockMaybeSingle.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied for table message" } });
    const out = await run(true);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(out.meta.requestStatus).toBe("rejected");
  });
});
