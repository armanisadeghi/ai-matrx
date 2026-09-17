/**
 * THE ROOM NEVER SHOWS THE MACHINE TALKING TO ITSELF — AND NEVER GUESSES WHICH
 * CONVERSATION IT IS IN.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 5, findings 7 and 8, 2026-09-16).
 *
 * Finding 7: a raw backend exception rendered inside a live Vision Interview
 * thread, between the Sounding Board's reply and the composer, with the
 * Expert's just-typed turn still unsent below it:
 *
 *   ⚠ Conversation already exists: A conversation with
 *     id='40dd2c57-6b43-47c4-b81c-1f40efedc977' already exists and has already
 *     been used. Pass is_new=false to continue it, or mint a new
 *     conversation_id.
 *
 * TWO causes, two guards here.
 *
 * THE SOURCE: `conversation_started` is computed live per `/roles` call and is
 * deliberately never persisted, so the copy on the session row can never carry
 * it. A room reading the persisted binding alone always got `false`, called an
 * already-used conversation a reservation, and sent the next turn as turn 1
 * with `is_new: true` — which is precisely what that 409 refuses. "Nobody has
 * told us yet" and "no" are different facts.
 *
 * THE LEAK: any server error whose payload carries no `user_message` reached
 * the thread verbatim. The bubble now shows a declared sentence WITH its
 * remedy, and every original byte keeps its place under Details.
 *
 * Finding 8: returning to a session whose Finish had already written a real
 * Vision document landed under a permanent "Working…" — the reload-resume rule
 * armed a follower over a long-dead run — so the documents Finish had just
 * written could not be reached at all.
 */

import {
  friendlyStreamError,
  looksLikeDeveloperTalk,
  GENERIC_FAILURE,
} from "@/features/agents/components/run/friendlyStreamError";
import { reloadResumeVerdict } from "../hooks/reloadResume";
import { roleBinding, roomMayClaimMaterialization } from "../types";

/** Verbatim, from the walk. */
const RAW_409 =
  "A conversation with id='40dd2c57-6b43-47c4-b81c-1f40efedc977' already exists and has already been used. Pass is_new=false to continue it, or mint a new conversation_id.";

describe("the room never shows the machine talking to itself", () => {
  it("refuses to print the 409 the walk found, and offers the way out", () => {
    expect(looksLikeDeveloperTalk(RAW_409)).toBe(true);
    const spoken = friendlyStreamError({
      message: RAW_409,
      errorType: "conversation_already_exists",
    });
    expect(spoken.message).not.toContain("is_new");
    expect(spoken.message).not.toContain("40dd2c57");
    expect(spoken.message).not.toContain("conversation_id");
    expect(spoken.message).toMatch(/Retry/);
    expect(spoken.message).toMatch(/Nothing you wrote was lost/);
    // The original is kept — under Details, where it was always meant to be.
    expect(spoken.detail).toBe(RAW_409);
  });

  it("refuses an unrecognised developer sentence too, and still says what to do", () => {
    const spoken = friendlyStreamError({
      message: "Traceback (most recent call last): File \"aidream/x.py\", line 4",
    });
    expect(spoken.message).toBe(GENERIC_FAILURE);
    expect(spoken.detail).toContain("Traceback");
  });

  it("the server's own person-facing sentence always wins", () => {
    const spoken = friendlyStreamError({
      userMessage: "We could not reach the model just now. Try again in a moment.",
      message: RAW_409,
    });
    expect(spoken.message).toBe(
      "We could not reach the model just now. Try again in a moment.",
    );
    expect(spoken.detail).toBe(RAW_409);
  });

  it("a plain sentence a human wrote is shown as written", () => {
    const plain = "The model refused this request because it was too long.";
    expect(looksLikeDeveloperTalk(plain)).toBe(false);
    expect(friendlyStreamError({ message: plain }).message).toBe(plain);
  });
});

describe("the room never guesses which conversation it is in", () => {
  const started = (extra: Record<string, unknown>) => ({
    role_bindings: {
      sounding_board: {
        agent_id: "11111111-2222-3333-4444-555555555555",
        conversation_id: "40dd2c57-6b43-47c4-b81c-1f40efedc977",
        ...extra,
      },
    },
  });

  it("a persisted binding is 'nobody has told us', never 'no'", () => {
    const binding = roleBinding(started({}) as never, "sounding_board" as never);
    expect(binding?.conversationStartedKnown).toBe(false);
    expect(roomMayClaimMaterialization(binding, "resolving")).toBe(false);
    expect(roomMayClaimMaterialization(binding, "idle")).toBe(false);
  });

  it("the /roles answer — either way — lets the room speak", () => {
    for (const value of [true, false]) {
      const binding = roleBinding(
        started({ conversation_started: value }) as never,
        "sounding_board" as never,
      );
      expect(binding?.conversationStartedKnown).toBe(true);
      expect(binding?.conversationStarted).toBe(value);
      expect(roomMayClaimMaterialization(binding, "resolving")).toBe(true);
    }
  });

  it("a FAILED /roles ends the wait — the room's own error half speaks instead", () => {
    const binding = roleBinding(started({}) as never, "sounding_board" as never);
    expect(roomMayClaimMaterialization(binding, "failed")).toBe(true);
  });
});

describe("a finished interview has nothing to follow", () => {
  it("a finalized session reconciles to complete instead of arming a dead run", () => {
    expect(reloadResumeVerdict("2026-09-16T23:14:02Z")).toBe("already_finished");
  });

  it("a live session still follows its run", () => {
    expect(reloadResumeVerdict(null)).toBe("follow_the_run");
    expect(reloadResumeVerdict(undefined)).toBe("follow_the_run");
    expect(reloadResumeVerdict("")).toBe("follow_the_run");
  });
});
