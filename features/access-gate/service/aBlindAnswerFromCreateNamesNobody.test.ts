/**
 * RC-A2m (2026-09-26): `access_request_create` answers a person the not-found split hides a record
 * from with the blind sentence `{asked, says}` — the same for a real and a random id. The client
 * must treat that as a complete answer: no "incomplete response" error, no recipient, no title, and
 * no DM to anybody (the server already told the owner when the record is real).
 *
 * RED before the fix: `createAccessRequest` threw "The access request response was incomplete."
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ rpc }) }));

import { BLIND_ASK_ANSWER, createAccessRequest, createDeleteRequest } from "./accessRequests";

describe("a blind answer from access_request_create", () => {
  beforeEach(() => rpc.mockReset());

  it("is the one sentence and names nobody", async () => {
    rpc.mockResolvedValueOnce({ data: { asked: true, says: BLIND_ASK_ANSWER }, error: null });
    const out = await createAccessRequest({
      resourceType: "task",
      resourceId: "5b0e3c1a-9d2f-4c11-8f00-0c0ffee00001",
      currentUserId: "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
    });
    expect(out.blindAnswer).toBe(BLIND_ASK_ANSWER);
    expect(out.recipients).toEqual([]);
    expect(out.entityTitle).toBeNull();
    expect(out.delivered).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1); // no notification RPCs after it
  });

  it("holds for the governed delete ask too", async () => {
    rpc.mockResolvedValueOnce({ data: { asked: true, says: BLIND_ASK_ANSWER }, error: null });
    const out = await createDeleteRequest({
      resourceType: "note",
      resourceId: "5b0e3c1a-9d2f-4c11-8f00-0c0ffee00002",
      currentUserId: "4060701e-706a-4c76-b3ca-0bbc69fa5a14",
    });
    expect(out.blindAnswer).toBe(BLIND_ASK_ANSWER);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
