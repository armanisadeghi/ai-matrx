// features/education/spoken-practice/data/generateSession.ts
//
// The ONE new agent call in Spoken Practice: run the "Session Designer" agent to
// produce a grounded set of spoken prompts. Same execution discipline as the
// FastFire grader + tutor review lanes — launch (autoRun:false / background),
// executeInstance, poll the JSON extractor, coerce, clean up. Never throws.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import type { TrustConfidence } from "@/features/education/trust/types";
import { SPOKEN_PRACTICE_AGENTS } from "../agents";
import type {
  PracticePlan,
  PracticePrompt,
  PracticeSource,
  SpokenPracticeMode,
} from "../types";
import { promptTrust } from "./grounding";

export interface GenerateSessionArgs {
  mode: SpokenPracticeMode;
  focus: string;
  difficulty: string;
  count: number;
  studyMaterial: string;
  /** The source, for attaching trust citations to each prompt. */
  source: PracticeSource | null;
}

async function waitForObject(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 120_000,
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
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asConfidence(v: unknown): TrustConfidence {
  return v === "grounded" || v === "not_in_material" ? v : "inferred";
}

/** Coerce raw agent JSON into a normalized, id-stamped, trust-carrying plan. */
export function coercePracticePlan(
  raw: unknown,
  source: PracticeSource | null,
): PracticePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rawPrompts = Array.isArray(r.prompts) ? r.prompts : [];

  const prompts: PracticePrompt[] = [];
  for (const p of rawPrompts) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const promptText = asString(o.prompt).trim();
    if (!promptText) continue; // an unusable prompt — drop it
    const confidence = asConfidence(o.confidence);
    prompts.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${prompts.length}`,
      prompt: promptText,
      referenceAnswer: asString(o.reference_answer),
      rubric: asString(o.rubric),
      focusArea: asString(o.focus_area),
      confidence,
      trust: promptTrust(confidence, source),
    });
  }
  if (prompts.length === 0) return null;

  return {
    sessionTitle: asString(r.session_title) || "Spoken practice session",
    intro: asString(r.intro),
    prompts,
  };
}

/**
 * Run the session designer and return a normalized plan (or null on failure —
 * the caller surfaces a friendly error and lets the learner retry).
 */
export function generateSession(args: GenerateSessionArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<PracticePlan | null> => {
    let conversationId: string | null = null;
    try {
      // The `pronunciation` mode has a DEDICATED designer that emits
      // target-language utterances (same plan shape); the three shipped modes
      // keep the original session designer.
      const designerAgentId =
        args.mode === "pronunciation"
          ? SPOKEN_PRACTICE_AGENTS.designLanguageSession
          : SPOKEN_PRACTICE_AGENTS.designSession;

      const launch = await dispatch(
        launchAgentExecution({
          agentId: designerAgentId,
          surfaceKey: "education-spoken-practice-generate",
          // No dedicated SourceFeature exists (adding one lives in the frozen
          // agents module); reuse the closest sibling — generating graded
          // questions — which is exactly what this does.
          sourceFeature: "education-assessment",
          isEphemeral: false,
          runtime: {
            variables: {
              mode: args.mode,
              focus: args.focus,
              study_material: args.studyMaterial,
              difficulty: args.difficulty,
              count: String(args.count),
            },
          },
          config: { autoRun: false, displayMode: "background" },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;

      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      const requestId = exec.requestId;
      if (!requestId) return null;

      const raw = await waitForObject(getState, requestId);
      return coercePracticePlan(raw, args.source);
    } catch (err) {
      console.error("[spoken-practice.generateSession] failed:", err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
