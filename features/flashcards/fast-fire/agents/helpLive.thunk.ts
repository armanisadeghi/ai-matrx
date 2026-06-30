// features/flashcards/fast-fire/agents/helpLive.thunk.ts
//
// The "I'm confused" live help lane (REQUIREMENTS §9 intent, AGENT_SPECS §6,
// fc_help_live). OPTIONAL (hard-requirement #6): with no help agent configured
// the caller gets `null` and the UI shows a "configure a help agent" hint — the
// drill is unaffected. When configured, it returns frontier-quality help from a
// fast model fed the learner's live context.
//
// Ephemeral + read-after-resolve. Returns the answer text (or null) to the
// caller, which surfaces it transiently — nothing is persisted.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { getFastFireAgentConfig } from "../config";
import { selectFastFireScoreboard } from "../redux/fastFire.selectors";

interface HelpLiveArgs {
  front: string;
  back: string;
  question?: string;
}

export interface HelpLiveResult {
  answer: string;
  hintLevel: "nudge" | "partial" | "full";
  followups: string[];
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 60_000,
): Promise<unknown | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (selectJsonExtractionComplete(requestId)(state)) {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    if (selectRequestStatus(requestId)(state) === "error") {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/** Returns help, or null when no help agent is configured / it failed. */
export function helpLive(args: HelpLiveArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<HelpLiveResult | null> => {
    const config = getFastFireAgentConfig();
    if (!config.helpAgentId) return null; // optional lane

    const board = selectFastFireScoreboard(getState());

    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: config.helpAgentId,
          surfaceKey: "fastfire-help-live",
          // NOT ephemeral (see docs/EPHEMERAL_AGENT_RUNS_SPEC.md); kept out of
          // normal chats via a distinct system source_feature (source-registry.ts).
          sourceFeature: "fastfire-help",
          isEphemeral: false,
          runtime: {
            userInput: args.question?.trim() || "I'm confused — help me with this card.",
            variables: {
              front: args.front,
              back: args.back,
              session_score: board.avgScorePct ?? 0,
              recent_correct: [],
              recent_wrong: [],
              struggled_topics: [],
              due_count: 0,
              time_on_card_ms: 0,
              card_history: [],
            },
          },
          config: {
            autoRun: true,
            displayMode: "direct",
            // No response_format override: fc_help_live is OUR agent — its output
            // shape lives in its DB definition (edit via agent_author, never a
            // call-time override, which also wrecks the prod agent cache).
          },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId = launch.requestId;
      if (!requestId) return null;

      const raw = await waitForObject(getState, requestId);
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const answer = typeof r.answer === "string" ? r.answer : "";
      if (!answer) return null;
      const hintLevel =
        r.hint_level === "nudge" || r.hint_level === "partial" || r.hint_level === "full"
          ? r.hint_level
          : "partial";
      return {
        answer,
        hintLevel,
        followups: Array.isArray(r.followups)
          ? r.followups.filter((x): x is string => typeof x === "string")
          : [],
      };
    } catch (err) {
      console.error("[fastfire.helpLive] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
