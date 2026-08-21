"use client";

/**
 * AgentContentList — THE renderer for the §6 content channel of an agent run.
 *
 * ## The gap it closes
 *
 * `matrx-ai` has always sent more than two keys. Alongside `final_text` and
 * `structured_output` the agent-run envelope carries `content`: the response as
 * an ORDERED LIST OF KIND INSTANCES (WORKFLOW_KINDS_DESIGN.md §6) — prose is one
 * `markdown` instance, a bound answer is one instance of its bound kind, and
 * prose with embedded structures is the interleaved sequence, each element
 * carrying its own `__kind`. The browser read `structured_output` and
 * `final_text` and dropped the list on the floor, so a reader got flat text
 * where the server had sent typed, renderable shapes.
 *
 * ## What this does, and what it refuses to do
 *
 * Each entry goes to `KindInstanceRender` — the same production path the
 * workflow readout already uses — in the SERVER'S order, never re-sorted and
 * never merged. A kind with a component renders through it; a kind without one
 * lands on the platform floor (`StructuredValueView`), which is also where an
 * entry that named no kind at all goes. Nothing here parses, formats, or
 * fences: a JSON dump in front of a non-technical reader is the defect this
 * whole path exists to prevent (19 of 23 Study Pack steps, 2026-08-18).
 *
 * ## Bare by construction (THE WRAPPER LAW)
 *
 * Both hosts — the `agent_result` component and the settled-output fallback —
 * already draw their own chrome, so this adds none: entries stack with spacing
 * and nothing else.
 */

import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import type { AgentRunContentEntry } from "../agent-run-output";

export function AgentContentList({
  content,
}: {
  content: AgentRunContentEntry[];
}) {
  return (
    <div className="space-y-3">
      {content.map((entry, index) =>
        entry.kind ? (
          <KindInstanceRender
            // Position IS the identity here: the list is an ordered transcript
            // of one finished run, and the same kind may legitimately appear
            // twice in it.
            key={`${index}-${entry.kind}`}
            kind={entry.kind}
            value={entry.value}
            showRoutingNote={false}
            variant="bare"
          />
        ) : (
          // No name to route on, so the floor directly — the same document view
          // `KindInstanceRender` would land on, without asking the registry
          // about a kind that was never declared.
          <StructuredValueView key={index} value={entry.value} />
        ),
      )}
    </div>
  );
}

export default AgentContentList;
