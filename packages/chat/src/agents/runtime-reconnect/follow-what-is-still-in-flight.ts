/**
 * Steps (4) and (5) of reopening a conversation: the half that
 * `loadConversation` alone does not do.
 *
 *  (4) `surfaceColdPendingCalls` — a delegated tool prompt nobody answered
 *      (the tab closed mid-prompt) comes back so the run can resume;
 *  (5) `reconnectServerOperation` — the server may STILL be working on the
 *      last turn (streams detach on disconnect); ask /runtime for truth,
 *      follow it to terminal, and refetch the conversation when it lands.
 *
 * Every reopen path calls this after its `loadConversation`, never a copy of
 * it: `useConversationResume` (routes, history rows) and the `?panels=agent:`
 * hydrator (a window restored from its address). On 2026-10-01 the window
 * path loaded and stopped, so a reload during a panel's first turn came back
 * as an empty room the server then filled behind it, and the next send was
 * refused "Conversation already exists … Pass is_new=false".
 */

import type { ChatDispatch } from "../../store/root-state";
import { surfaceColdPendingCalls } from "../redux/execution-system/thunks/surface-cold-pending-calls.thunk";
import { reconnectServerOperation } from "./reconnect-server-operation.thunk";

export function followWhatIsStillInFlight(
  dispatch: ChatDispatch,
  conversationId: string,
): void {
  void dispatch(surfaceColdPendingCalls(conversationId));
  void dispatch(
    reconnectServerOperation({ conversationId, source: "cold-load" }),
  );
}
