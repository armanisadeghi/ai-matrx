/**
 * The shared composer's follow-up line uses Submit All's own targets.
 *
 * Break this catches: a paused Variations column that already ran made the
 * line say "Type a follow-up to run again" while Submit All — which leaves
 * paused columns out — would only start fresh columns from the variables.
 * The line and the fan-out now share one decision (`isSubmitAllTarget`).
 *
 * SUT: `selectSharedComposerFollowUpNotice` over the real mounted-mode column
 * resolver and the real empty-turn rule. No doubles.
 */

import type { RootState } from "@/lib/redux/store";
import {
  FOLLOW_UP_NEEDED_TEXT,
  selectSharedComposerFollowUpNotice,
} from "../battle-follow-up";

const input = (text: string) => ({ text, messageParts: null, submissionPhase: "idle", lastSubmittedText: "" });

function variationsBattle(columns: { id: string; ran: boolean; paused: boolean }[]): RootState {
  return {
    agentComparison: { mountedMode: "variations", columns: [] },
    agentComparisonVariations: {
      locked: { sourceAgentId: "agent-support-reply", agentVersion: null, agentVersionId: null },
      inputConversationId: "shared",
      columns: columns.map((c) => ({
        columnId: c.id,
        conversationId: c.id,
        label: c.id,
        paused: c.paused,
        syntheticAgentId: `synthetic-${c.id}`,
      })),
    },
    conversations: {
      byConversationId: Object.fromEntries(
        columns.map((c) => [c.id, { cacheOnly: !c.ran, isEphemeral: false }]),
      ),
    },
    messages: {
      byConversationId: Object.fromEntries(
        columns.map((c) => [c.id, { orderedIds: c.ran ? ["u1", "a1"] : [] }]),
      ),
    },
    instanceUserInput: { byConversationId: { shared: input("") } },
    instanceVariableValues: { byConversationId: {} },
    instanceResources: { byConversationId: {} },
  } as unknown as RootState;
}

describe("the composer line follows Submit All's targets", () => {
  it("stays hidden when the only column that ran is paused (only fresh columns would run)", () => {
    const state = variationsBattle([
      { id: "warm-tone", ran: true, paused: true },
      { id: "formal-tone", ran: false, paused: false },
    ]);
    expect(selectSharedComposerFollowUpNotice(state, "shared")).toBeNull();
  });

  it("shows when an active column that ran would get an empty follow-up", () => {
    const state = variationsBattle([
      { id: "warm-tone", ran: true, paused: false },
      { id: "formal-tone", ran: false, paused: false },
    ]);
    expect(selectSharedComposerFollowUpNotice(state, "shared")).toBe(FOLLOW_UP_NEEDED_TEXT);
  });
});
