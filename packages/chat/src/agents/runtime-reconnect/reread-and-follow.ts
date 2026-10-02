/**
 * THE ONE DOOR AFTER A PERSON ANSWERS AN AGENT'S ASK — re-read the
 * conversation, then follow whatever is still in flight.
 *
 * An answered ask resumes the parked turn on the server, and that turn can
 * stop again on a tool only this open page can run (bench 2026-10-01: an
 * answered `ask_person` resumed, then parked on `board_read`). A bare
 * `loadConversation` shows the rows written so far and stops: nobody surfaces
 * the pending client call, nobody follows the running operation, and the work
 * waits for a reload. `followWhatIsStillInFlight` is the reload's own half, so
 * every answer door runs both — and follows even when the re-read fails,
 * because the turn may still be running.
 *
 * Guard: `__tests__/an-answered-ask-follows-the-resumed-turn.test.ts` (also a
 * census — every door rendering `ActionRequestInlineAnswer` goes through here).
 */
import type { ChatDispatch } from "../../store/root-state";
import { loadConversation } from "../redux/execution-system/thunks/load-conversation.thunk";
import { followWhatIsStillInFlight } from "./follow-what-is-still-in-flight";

export async function rereadAndFollow(
  dispatch: ChatDispatch,
  conversationId: string,
  /** Names the door in the warning when the re-read fails. */
  label: string,
): Promise<void> {
  try {
    await dispatch(loadConversation({ conversationId })).unwrap();
  } catch (err: unknown) {
    console.warn(
      `[${label}] re-reading the conversation failed — following the live turn anyway; the rows show on the next load.`,
      err,
    );
  }
  followWhatIsStillInFlight(dispatch, conversationId);
}
