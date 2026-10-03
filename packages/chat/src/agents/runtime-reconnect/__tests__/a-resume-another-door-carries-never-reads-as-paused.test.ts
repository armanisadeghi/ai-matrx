/**
 * A RESUME ANOTHER DOOR IS ALREADY CARRYING NEVER READS AS "PAUSED".
 *
 * Break this guards (board sidebar chat, 2026-10-02 23:07–23:13Z): the agent
 * sent three delegated client calls in parallel (two `apply_surface_write`, one
 * `board_add_tile`). A tool-result POST answered `continuation_needed` and its
 * `resumeInstance` took the single-flight claim and ran the turn on. The
 * reconnect follower, finding zero pending calls, stamped "continuing" and
 * dispatched its OWN `resumeInstance` — which was refused ("Resume skipped —
 * already claimed for this user_request"). That refusal was read as a failure
 * and stamped `needs_action`: the chat said "The agent paused without a visible
 * question. Continue agent" while the agent was in fact working.
 *
 * The refusal hands the turn on; the follower's stamp is stale and goes away
 * (or stays "continuing" until the claim holder's stream opens and clears it).
 * Only a real failure asks the person to continue.
 */
import { claimResume, releaseResumeClaim } from "../../redux/execution-system/thunks/resume-claims";
import { resumeInstance } from "../../redux/execution-system/thunks/resume-instance.thunk";
import { decideAfterContinueRefused } from "../waiting-input-recovery";

const USER_REQUEST = "5ece0e81-6212-4909-aaec-99da75c72b19";
const CONVERSATION = "7bde4d03-0633-47b5-9bd5-301ad30161ed";

afterEach(() => releaseResumeClaim(USER_REQUEST));

/** The real rejection `resumeInstance` produces when another resume holds the claim. */
async function refusedBecauseClaimed() {
  expect(claimResume(USER_REQUEST)).toBe(true); // the tool-result door's resume
  const getState = jest.fn(() => {
    throw new Error("the claimed-skip path must not read state");
  });
  const action = await resumeInstance({ conversationId: CONVERSATION, userRequestId: USER_REQUEST })(
    jest.fn() as never,
    getState as never,
    undefined,
  );
  expect(resumeInstance.rejected.match(action)).toBe(true);
  return action as ReturnType<typeof resumeInstance.rejected>;
}

describe("the follower's resume refused because another resume holds the claim", () => {
  it("is never turned into 'needs_action' while a stream carries the turn", async () => {
    const action = await refusedBecauseClaimed();
    expect(decideAfterContinueRefused({ originalErrorName: action.meta.originalErrorName, liveStream: true })).toBe(
      "clear",
    );
  });

  it("stays 'continuing' while the claim holder has not opened its stream yet", async () => {
    const action = await refusedBecauseClaimed();
    expect(decideAfterContinueRefused({ originalErrorName: action.meta.originalErrorName, liveStream: false })).toBe(
      "leave",
    );
  });
});

describe("a resume that really failed still offers Continue", () => {
  it("an unmarked rejection is needs_action", () => {
    expect(decideAfterContinueRefused({ originalErrorName: undefined, liveStream: false })).toBe("needs_action");
    expect(decideAfterContinueRefused({ originalErrorName: "TypeError", liveStream: true })).toBe("needs_action");
  });

  it("a scheduled retry carries the turn: left alone", () => {
    expect(decideAfterContinueRefused({ originalErrorName: "ResumeRetryScheduled", liveStream: false })).toBe("leave");
  });
});
