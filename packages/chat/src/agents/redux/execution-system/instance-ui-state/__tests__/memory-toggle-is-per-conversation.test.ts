/**
 * The Observational Memory switch is queued PER CONVERSATION.
 *
 * It was one global flag: flip Memory in conversation A, send in conversation
 * B first, and B carried `memory: true` (and A's switch was spent). The
 * composer puts Memory in every mode's + menu, so this is no longer an
 * admin-only corner. This pins the keyed behaviour the send paths rely on.
 */

import reducer, {
  clearMemoryToggleRequest,
  removeInstanceUIState,
  requestMemoryToggle,
} from "../instance-ui-state.slice";
import { selectMemoryToggleRequest } from "../instance-ui-state.selectors";
import type { RootState } from "@/lib/redux/store";

const asRoot = (instanceUIState: ReturnType<typeof reducer>) => ({ instanceUIState }) as unknown as RootState;

describe("memory toggle is queued per conversation", () => {
  it("a switch flipped in A is pending only for A", () => {
    const state = reducer(undefined, requestMemoryToggle({ conversationId: "A", enabled: true }));
    expect(selectMemoryToggleRequest("A")(asRoot(state))).toBe(true);
    expect(selectMemoryToggleRequest("B")(asRoot(state))).toBeUndefined();
  });

  it("sending B never spends A's switch", () => {
    let state = reducer(undefined, requestMemoryToggle({ conversationId: "A", enabled: true }));
    state = reducer(state, requestMemoryToggle({ conversationId: "B", enabled: false }));
    state = reducer(state, clearMemoryToggleRequest({ conversationId: "B" }));
    expect(selectMemoryToggleRequest("A")(asRoot(state))).toBe(true);
    expect(selectMemoryToggleRequest("B")(asRoot(state))).toBeUndefined();
  });

  it("removing a conversation's UI state drops its pending switch", () => {
    let state = reducer(undefined, requestMemoryToggle({ conversationId: "A", enabled: false }));
    state = reducer(state, removeInstanceUIState("A"));
    expect(selectMemoryToggleRequest("A")(asRoot(state))).toBeUndefined();
  });
});
