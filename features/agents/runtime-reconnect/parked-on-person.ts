// features/agents/runtime-reconnect/parked-on-person.ts — IS THIS TURN WAITING ON A PERSON?
//
// A tool may park its own call on the person (an `approve_spend` ask). The row
// stays `delegated` with `metadata.parked_on`, and `pending_calls` leaves it
// out so no client answers it — so the reconnect cannot learn of it from the
// pending-call ledger. aidream's pending list for this person is the one
// place that says whether an ask is still OPEN; an open ask on this
// conversation means its turn is waiting on them.

import { fetchPendingActionRequests } from "@/features/action-requests/self-service";

/** Open action requests on this conversation. Throws when the list cannot be read. */
export async function countOpenAsksForConversation(conversationId: string): Promise<number> {
  const pending = await fetchPendingActionRequests();
  return pending.filter((row) => row.conversation_id === conversationId).length;
}
