/**
 * Message-action registry — maps an `action_data.kind` to the deep-link chips
 * rendered inside a message bubble. Metadata-in-one-place (the spirit of the
 * feature admin map): add a kind here, every bubble that carries it gets chips.
 * Unknown kinds render nothing (forward-compatible).
 *
 * First kind: `agent_drift` → "Review usages" (opens the Find Usages window)
 * + "Open drift report" (links to /reports/agent-drift).
 *
 * Renderers are hooks-friendly React components, so they can call opener hooks.
 */

"use client";

import { FileChartColumn, Search } from "lucide-react";
import Link from "next/link";
import { useOpenAgentFindUsagesWindow } from "@/features/overlays/openers/agentFindUsagesWindow";
import type {
  AgentDriftActionPayload,
  MessageActionData,
} from "@/features/messaging/types";

interface ChipRenderContext {
  isOwn: boolean;
}

type ChipRenderer = (data: MessageActionData, ctx: ChipRenderContext) => React.ReactNode;

function chipClass(isOwn: boolean): string {
  return [
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
    "transition-colors",
    isOwn
      ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
      : "border-border bg-background/70 text-foreground hover:bg-background",
  ].join(" ");
}

function AgentDriftChips({ data, isOwn }: { data: MessageActionData; isOwn: boolean }) {
  const openFindUsages = useOpenAgentFindUsagesWindow();
  const payload = data.payload as AgentDriftActionPayload;
  if (!payload?.agent_id) return null;
  return (
    <>
      <button
        type="button"
        className={chipClass(isOwn)}
        onClick={() => openFindUsages({ agentId: payload.agent_id })}
      >
        <Search className="h-3 w-3" aria-hidden />
        Review usages
      </button>
      <Link href="/reports/agent-drift" className={chipClass(isOwn)}>
        <FileChartColumn className="h-3 w-3" aria-hidden />
        Drift report
      </Link>
    </>
  );
}

const RENDERERS: Record<string, ChipRenderer> = {
  agent_drift: (data, ctx) => <AgentDriftChips data={data} isOwn={ctx.isOwn} />,
};

/** Render the chips for a message's action_data, or null if none/unknown. */
export function renderMessageActionChips(
  actionData: MessageActionData | null | undefined,
  ctx: ChipRenderContext,
): React.ReactNode {
  if (!actionData?.kind) return null;
  const renderer = RENDERERS[actionData.kind];
  return renderer ? renderer(actionData, ctx) : null;
}

/** Whether a given action_data has a registered renderer (for layout decisions). */
export function hasMessageAction(actionData: MessageActionData | null | undefined): boolean {
  return !!actionData?.kind && actionData.kind in RENDERERS;
}
