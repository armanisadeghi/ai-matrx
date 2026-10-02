/** The reconnect's durable fact for a parked turn: open asks on THIS conversation only. */
const fetchPending = jest.fn();
jest.mock("@/features/action-requests/self-service", () => ({
  fetchPendingActionRequests: () => fetchPending(),
}));

import { countOpenAsksForConversation } from "../parked-on-person";

it("counts only this conversation's open asks", async () => {
  fetchPending.mockResolvedValue([
    { request_id: "a", conversation_id: "conv-1" },
    { request_id: "b", conversation_id: "conv-2" },
    { request_id: "c", conversation_id: null },
  ]);
  await expect(countOpenAsksForConversation("conv-1")).resolves.toBe(1);
  await expect(countOpenAsksForConversation("conv-3")).resolves.toBe(0);
});

it("a failed read is thrown, never taken as 'nothing parked'", async () => {
  fetchPending.mockRejectedValue(new Error("offline"));
  await expect(countOpenAsksForConversation("conv-1")).rejects.toThrow("offline");
});
