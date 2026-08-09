"use client";

/**
 * GenericEmitRenderer — the universal body for any `node_emitted` payload
 * WITHOUT a custom renderer. The emit equivalent of the tool feature's
 * `GenericRenderer`, but PAYLOAD-shaped (it takes `EmitRendererProps`, not a
 * tool-call `entry`).
 *
 * It leans on the same type-aware result-field library the tool generic
 * renderer uses — `ResultValue` (density="full", HIDE NOTHING) — so a payload
 * of any shape (text/markdown/list/table/object/media/json) renders truthfully
 * and beautifully without per-shape code here.
 *
 *   confirmation → a single inline confirmation line (title / payload.message),
 *                  with the rest of the payload shown below when present.
 *   summary | full | restructured → the title (markdown) + the full payload.
 */

import React, { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";

import MarkdownStream from "@/components/MarkdownStream";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { AssistChip } from "@/features/assists/components/AssistChip";
import { makeEphemeralAssist, type Assist } from "@/features/assists/types";
import { KIND_CREATOR_SLOT_KEY } from "@/features/content-ir/studio/constants";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import type { EmitRendererProps } from "./types";

/** Cap for the inlined payload JSON — enough context, never a mega-prompt. */
const SURPRISE_UI_PAYLOAD_MAX = 6_000;

/**
 * The "Surprise-me UI" assist (ephemeral): this structured output rendered
 * through the GENERIC viewer, which means no purpose-built component exists
 * for its shape yet — exactly the moment the AI can build one. The chip
 * opens the shape-creator agent pre-filled with the payload; the user
 * reviews and sends. No ledger row: the chip exists while the output does.
 */
function surpriseUiAssist(
  value: unknown,
  title: string | null | undefined,
  nodeId: string,
  creatorId: string | null,
): Assist | null {
  if (!value || typeof value !== "object") return null;
  // The `content_ir.kind_creator` slot resolves in the component (the user's
  // own binding wins); unresolved → no chip (useAgentSlot already screamed).
  if (!creatorId) return null;
  let json: string;
  try {
    json = JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
  if (json.length > SURPRISE_UI_PAYLOAD_MAX) {
    json = `${json.slice(0, SURPRISE_UI_PAYLOAD_MAX)}\n… (truncated)`;
  }
  const label = title?.trim() || nodeId;
  return makeEphemeralAssist({
    sourceKey: "workflow.surprise_ui",
    title: "Build a beautiful UI for this output",
    body: "An AI agent creates a Shape and a purpose-built component for this output's structure, so future runs render with a real UI instead of the generic viewer.",
    action: {
      kind: "launch_agent",
      agentId: creatorId,
      agentName: "Shape Creator",
      draftText:
        `Create a new Shape (kind) for this recurring workflow output ("${label}"), ` +
        `with a purpose-built output component, then activate it. ` +
        `Design the schema from this real payload:\n\n\`\`\`json\n${json}\n\`\`\``,
    },
  });
}

/** Pull a human confirmation line from the payload's `message`, if present. */
function extractMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return null;
}

/**
 * True when the payload is the `{ value }` wrapper the backend uses for a
 * non-dict emission — we unwrap it so a scalar/list/string renders as itself.
 */
function unwrapValue(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length === 1 &&
    "value" in (payload as Record<string, unknown>)
  ) {
    return (payload as Record<string, unknown>).value;
  }
  return payload;
}

export const GenericEmitRenderer: React.FC<EmitRendererProps> = ({
  mode,
  payload,
  title,
  nodeId,
}) => {
  const value = unwrapValue(payload);
  const { slot: creatorSlot } = useAgentSlot(KIND_CREATOR_SLOT_KEY);
  const creatorId = creatorSlot?.agentId ?? null;
  const assist = useMemo(
    () =>
      mode === "confirmation"
        ? null
        : surpriseUiAssist(value, title, nodeId, creatorId),
    [mode, value, title, nodeId, creatorId],
  );

  // ─── Confirmation ─────────────────────────────────────────────────────────
  // A single, calm inline line. Prefer the node's title, then payload.message.
  // Anything else in the payload renders below so nothing is hidden.
  if (mode === "confirmation") {
    const message = extractMessage(payload);
    const line = title ?? message ?? "Done.";
    const hasExtra = message ? value !== message : value != null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="min-w-0 break-words">{line}</span>
        </div>
        {hasExtra && (
          <div className="pl-6">
            <ResultValue value={value} density="full" />
          </div>
        )}
      </div>
    );
  }

  // ─── Summary / full / restructured ────────────────────────────────────────
  return (
    <div className="space-y-2">
      {title && (
        <div className="text-sm font-semibold text-foreground">
          <MarkdownStream content={title} />
        </div>
      )}
      <ResultValue value={value} density="full" />
      {assist && (
        <div className="flex justify-end">
          <AssistChip assist={assist} className="max-w-full" />
        </div>
      )}
    </div>
  );
};

export default GenericEmitRenderer;
