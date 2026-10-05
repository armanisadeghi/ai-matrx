"use client";

/**
 * SettledOutputBody — THE one renderer for a settled step's payload when the
 * kind registry has no component for its shape.
 *
 * Extracted from readout-parts so the wrapper kind component
 * (`NodeOutcomeBlock`) delegates to the SAME fallback the readout uses, rather
 * than growing a second reader of the same envelope. Two callers, one
 * implementation — the wrapper delegates, it never reimplements.
 *
 * It reads the SAME envelope through the same reader, so the §6 `content`
 * channel wins here too: an ordered list of typed instances renders through
 * `AgentContentList` (each entry via its own kind component) before either flat
 * field is considered. An empty channel is the normal case and changes nothing.
 *
 * The rule it encodes: an `ai.agent.start` step's output is the run ENVELOPE,
 * not the answer — it carries the verbatim prompt, the model id and the token
 * bill beside the two keys the reader wants. So read it
 * (`readAgentRunOutput`) and show only what the agent produced; anything else
 * is genuine data and gets the platform floor (`StructuredValueView`), which
 * renders any JSON value as a human document with the raw data one click away.
 */

import { RichContent } from "@/components/rich-content/RichContent";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";

import { looksLikeJsonDocument, readAgentRunOutput } from "../agent-run-output";
import { AgentContentList } from "./AgentContentList";

/**
 * Structured output with no DECLARED kind. A value that carries its own
 * `__kind` is still a kind — it renders as that kind's component (the value's
 * own claim routes it, the way `AgentResultBlock` does; Arman, 2026-09-30: a
 * kind is never drawn as raw JSON). Anything else renders as a human DOCUMENT
 * through the platform floor (`StructuredValueView`) — both through the one
 * settled-answer door, `AnswerValueView`.
 */
export function JsonBody({
  value,
}: {
  value: Record<string, unknown> | unknown[];
}) {
  return <AnswerValueView value={value} />;
}

/**
 * A settled string that is really a JSON document (an agent that answered with
 * JSON rather than through a bound schema). Parsed once and handed to the same
 * floor; unparseable text falls back to the canonical markdown renderer, which
 * is what it is.
 */
export function JsonTextBody({ text }: { text: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // Unparseable text that claims a kind is a broken kind, not prose: hand
    // it to the kind parser as a json region so it shows the kind's broken
    // state instead of the raw characters.
    return (
      <RichContent level="full"
        imagePolicy="ai"
        source={hasKindKey(text) ? `\u0060\u0060\u0060json\n${text}\n\u0060\u0060\u0060` : text}
      />
    );
  }
  return <AnswerValueView value={parsed} />;
}

/** What a settled step PRODUCED, for a step whose shape has no component. */
export function SettledOutputBody({
  output,
  heldOutcome = null,
}: {
  output: Record<string, unknown>;
  /**
   * A step held for approval, decided (lane HELD-STEP-WORDS, 2026-09-26).
   * The generic "This step ran, and handed its result to the next one." is a
   * lie here either way: refused, nothing ran and nothing was handed off; the
   * run ended at this step on a person's decision. Approved-with-no-content
   * output (a database write has nothing to hand a reader) is equally not
   * silence — say what actually happened instead of falling through to a
   * sentence written for an agent step that produced text.
   */
  heldOutcome?: "refused" | "approved" | null;
}) {
  if (heldOutcome === "refused") {
    return (
      <p className="text-xs text-muted-foreground">
        Refused; nothing was written and the run ended here.
      </p>
    );
  }
  const agent = readAgentRunOutput(output);
  if (!agent) return <JsonBody value={output} />;
  if (agent.content.length > 0) return <AgentContentList content={agent.content} />;
  if (agent.structured) return <JsonBody value={agent.structured} />;
  if (agent.finalText) {
    return looksLikeJsonDocument(agent.finalText) ? (
      <JsonTextBody text={agent.finalText} />
    ) : (
      <RichContent level="full" imagePolicy="ai" source={agent.finalText} />
    );
  }
  if (heldOutcome === "approved") {
    return (
      <p className="text-xs text-muted-foreground">
        Approved; the change was written.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      This step ran, and handed its result to the next one.
    </p>
  );
}
