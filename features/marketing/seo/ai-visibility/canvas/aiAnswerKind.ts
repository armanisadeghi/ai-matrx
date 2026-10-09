"use client";

/**
 * One answer engine's full answer to an AI-visibility query, as a canvas tab
 * (`ai-visibility-answer`), keyed by the answer's id. Light: registers at boot,
 * the body loads only when a tab renders.
 */

import { MessageSquareQuote } from "lucide-react";
import type { CanvasOpenInput } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";

export const AI_ANSWER_KIND = "ai-visibility-answer";

export type AiAnswerData = {
  /** Plain-language name of the engine ("ChatGPT"). */
  engine: string;
  /** The model that answered, when the provider named it. */
  model: string | null;
  /** The answer, as the provider returned it (markdown). */
  answer: string;
};

export function aiAnswerOpenInput(answerId: string, data: AiAnswerData): CanvasOpenInput {
  return { kind: AI_ANSWER_KIND, key: answerId, title: `${data.engine} answer`, data };
}

export function readAiAnswerData(data: unknown): AiAnswerData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { engine, model, answer } = data as Record<string, unknown>;
  if (typeof engine !== "string" || typeof answer !== "string") return null;
  return { engine, model: typeof model === "string" ? model : null, answer };
}

export const AI_ANSWER_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<AiAnswerData>({
  id: AI_ANSWER_KIND,
  surface: "dom",
  label: "Answer",
  icon: MessageSquareQuote,
  load: () => import("./AiAnswerCanvasView"),
  title: (data) => `${data.engine} answer`,
  // The answer text is the tab's own data, so it comes back after a reload.
  restore: true,
});
