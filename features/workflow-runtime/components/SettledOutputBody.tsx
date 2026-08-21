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

import MarkdownStream from "@/components/MarkdownStream";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";

import { looksLikeJsonDocument, readAgentRunOutput } from "../agent-run-output";
import { AgentContentList } from "./AgentContentList";

/**
 * Structured output whose shape has no kind component. It renders as a human
 * DOCUMENT through the platform floor: prose through the canonical markdown
 * renderer, uniform object arrays as a real table, media through
 * `InlineMediaRef`, nested objects as titled sections with humanized keys —
 * with the raw data one click away for us.
 */
export function JsonBody({
  value,
}: {
  value: Record<string, unknown> | unknown[];
}) {
  return <StructuredValueView value={value} />;
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
    return <MarkdownStream content={text} />;
  }
  return <StructuredValueView value={parsed} />;
}

/** What a settled step PRODUCED, for a step whose shape has no component. */
export function SettledOutputBody({
  output,
}: {
  output: Record<string, unknown>;
}) {
  const agent = readAgentRunOutput(output);
  if (!agent) return <JsonBody value={output} />;
  if (agent.content.length > 0) return <AgentContentList content={agent.content} />;
  if (agent.structured) return <JsonBody value={agent.structured} />;
  if (agent.finalText) {
    return looksLikeJsonDocument(agent.finalText) ? (
      <JsonTextBody text={agent.finalText} />
    ) : (
      <MarkdownStream content={agent.finalText} />
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      This step ran, and handed its result to the next one.
    </p>
  );
}
