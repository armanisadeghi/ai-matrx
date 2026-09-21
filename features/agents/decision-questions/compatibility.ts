/**
 * Compatibility honesty for the `decision_questions` part.
 *
 * THE LAW (`common-docs/systems/agents/typed-messages/FEATURE.md`):
 * "a part the model cannot take stays visible, greyed with the reason."
 * Never dropped, never silently converted, never rendered as if it will work.
 *
 * Two refusals exist, and they point at DIFFERENT parts:
 *
 *   1. The questions part itself, when the selected model has neither a
 *      decision route nor text input to render the questions into.
 *   2. A MEDIA part sitting beside a questions part on a decision model —
 *      the state a decision holder reads is text only, so the image/audio/
 *      video/document is what gets refused, not the questions.
 *
 * A third, softer verdict is `converted`: a text model has no decision route
 * but can be asked the same questions in prose and answer in the same shape.
 * That is a real change to how the request runs, so it is stated too.
 */

import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import { modelTakesDecisions } from "./budget";
import { partKind } from "./types";

export type PartCompatibility =
  | { verdict: "native" }
  | { verdict: "converted"; reason: string }
  /** The model is chosen but its catalog record has not arrived yet. Saying
   *  "this model cannot take questions" during that window would be a lie
   *  about the model rather than about our own loading. */
  | { verdict: "unknown"; reason: string }
  | { verdict: "refused"; reason: string };

/** Part kinds whose content is not text and so cannot be decision state. */
const NON_TEXT_PART_KINDS = new Set([
  "image",
  "audio",
  "video",
  "youtube_video",
  "youtube",
  "media",
]);

function modelLabel(model: AIModelRecord | null | undefined): string {
  return model?.common_name?.trim() || model?.name?.trim() || "This model";
}

function modelTakesText(model: AIModelRecord | null | undefined): boolean {
  if (!model) return false;
  const capabilities = parseCapabilities(model.capabilities, {
    modelId: model.id,
    modelName: model.name,
  });
  const conversational =
    capabilities.interaction === "turn" || capabilities.interaction === "single";
  return conversational && capabilities.input.includes("text");
}

/**
 * The verdict on the questions part itself for the selected model.
 * `modelId` separates "nothing chosen" from "chosen, record still loading".
 */
export function decisionQuestionsCompatibility(
  model: AIModelRecord | null | undefined,
  modelId?: string | null,
): PartCompatibility {
  if (!model) {
    if (modelId) {
      return {
        verdict: "unknown",
        reason:
          "This model's capabilities are still loading, so nothing can say yet whether it can run these questions.",
      };
    }
    return {
      verdict: "refused",
      reason:
        "Pick a model on the Model tab — until then nothing can say whether these questions can be asked.",
    };
  }
  if (modelTakesDecisions(model)) return { verdict: "native" };
  if (modelTakesText(model)) {
    return {
      verdict: "converted",
      reason: `${modelLabel(model)} has no decision route, so these questions are sent as text and the answers come back in the same shape — the probabilities are the model's own words, not measured.`,
    };
  }
  return {
    verdict: "refused",
    reason: `${modelLabel(model)} can neither run a decision nor read these questions as text, so this part is not sent.`,
  };
}

/**
 * The verdict on one OTHER part of the message, given that a questions part
 * shares the message.
 */
export function statePartCompatibility(
  part: Record<string, unknown>,
  model: AIModelRecord | null | undefined,
  hasQuestionsPart: boolean,
): PartCompatibility {
  if (!hasQuestionsPart) return { verdict: "native" };
  const kind = partKind(part);
  if (!NON_TEXT_PART_KINDS.has(kind)) return { verdict: "native" };
  if (!modelTakesDecisions(model)) return { verdict: "native" };
  return {
    verdict: "refused",
    reason: `A decision reads text state only, so ${modelLabel(model)} does not receive this ${kind.replace(/_/g, " ")} — convert it to text or move the questions to a message of their own.`,
  };
}
