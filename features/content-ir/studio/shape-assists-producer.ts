"use client";

/**
 * Deterministic Assists producer: a shape YOU own has no custom component —
 * the AI can build one (the "Surprise-me UI" pattern, user-triggered by a
 * chip instead of a buried studio button).
 *
 * Zero tokens to notice; the accept action opens the shape-creator agent
 * pre-filled with the component brief. Deduped per kind; a dismissal is
 * durable (never re-emitted). Capped per sweep so a bulk import never
 * floods the dock.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import type { EmitAssistInput } from "@/features/assists/types";
import { shapeCreatorAgentId } from "./constants";
import { composeKindAgentIntent } from "./kind-agent-intents";
import type { ShapeListEntry } from "./studio-catalog";

const MAX_PER_SWEEP = 5;
const SOURCE_KEY = "content_ir.missing_component";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function produceMissingComponentAssists(
  entries: ShapeListEntry[],
  userId: string,
  dispatch: AppDispatch,
): Promise<void> {
  const creatorId = shapeCreatorAgentId();
  if (!creatorId) return;

  const candidates = entries
    .filter(
      (e) => e.createdBy === userId && e.isActive && !e.hasComponent,
    )
    .slice(0, MAX_PER_SWEEP);
  if (candidates.length === 0) return;

  const keyFor = (kind: string) => `${SOURCE_KEY}:${kind}`;
  const emittable = new Set(
    await filterUndecidedKeys(candidates.map((e) => keyFor(e.kind))),
  );

  for (const entry of candidates) {
    if (!emittable.has(keyFor(entry.kind))) continue;
    const input: EmitAssistInput = {
      sourceKey: SOURCE_KEY,
      title: `AI can build a custom UI for "${entry.label}"`,
      body: `Your shape ${entry.kind} renders with the generic viewer. One click opens the shape-creator agent with the component brief ready.`,
      action: {
        kind: "launch_agent",
        agentId: creatorId,
        agentName: "Shape Creator",
        draftText: composeKindAgentIntent({
          kind: entry.kind,
          label: entry.label,
          part: "component",
        }),
      },
      surfaceName: "matrx-user/shapes",
      entityType: "kind_definition",
      entityId: entry.id,
      dedupeKey: keyFor(entry.kind),
      expiresAt: new Date(Date.now() + THIRTY_DAYS_MS).toISOString(),
    };
    await emitAssistTracked(userId, input, dispatch);
  }
}
