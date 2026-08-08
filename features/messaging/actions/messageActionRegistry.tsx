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

import { useState } from "react";
import { AlarmClock, CircleCheck, ExternalLink, FileChartColumn, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { useOpenAgentFindUsagesWindow } from "@/features/overlays/openers/agentFindUsagesWindow";
import type {
  AgentDriftActionPayload,
  MessageActionData,
  OpenLinkActionPayload,
  ResourceSharedActionPayload,
  TaskReminderActionPayload,
} from "@/features/messaging/types";
import { getResourceSharePath } from "@/utils/permissions/registry";
import { getResourceIcon } from "@/features/sharing/resourceIcons";
import { EntityCard } from "@/features/tool-call-visualization/renderers/_shared-entity/EntityCard";

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

/**
 * `resource_shared` — a full clickable card for a resource shared with the
 * recipient. Uses the shared EntityCard primitive + registry icon/URL so it
 * works for every shareable type, and opens the resource in the app.
 */
function ResourceSharedCard({ data }: { data: MessageActionData }) {
  const p = data.payload as ResourceSharedActionPayload;
  if (!p?.resource_type || !p?.resource_id) return null;
  const href = getResourceSharePath(p.resource_type, p.resource_id);
  const Icon = getResourceIcon(p.resource_type);
  const subtitle = p.sharer_name
    ? `${p.resource_label} · shared by ${p.sharer_name}`
    : p.resource_label;
  return (
    <div className="mt-1 w-full max-w-sm">
      <EntityCard
        icon={Icon}
        title={p.resource_title || p.resource_label || "Shared item"}
        subtitle={subtitle}
        actionLabel="Open"
        actions={[{ label: "Open", icon: ExternalLink, href }]}
      />
    </div>
  );
}

/**
 * `open_link` — the generic single deep-link chip for system DMs that point
 * the user at an in-app page (external URLs are refused).
 */
function OpenLinkChip({ data, isOwn }: { data: MessageActionData; isOwn: boolean }) {
  const p = data.payload as OpenLinkActionPayload;
  if (!p?.href || !p?.label || !p.href.startsWith("/")) return null;
  return (
    <Link href={p.href} className={chipClass(isOwn)}>
      <ExternalLink className="h-3 w-3" aria-hidden />
      {p.label}
    </Link>
  );
}

/**
 * `task_reminder` — actionable task notification (assignment, due reminder).
 * Open navigates; Complete and Snooze act inline through the canonical task
 * services (recurrence-aware completion; per-user snooze state).
 */
function TaskReminderChips({ data, isOwn }: { data: MessageActionData; isOwn: boolean }) {
  const p = data.payload as TaskReminderActionPayload;
  const [done, setDone] = useState<"completed" | "snoozed" | null>(null);
  if (!p?.task_id) return null;

  const complete = async () => {
    const { completeTask } = await import(
      "@/features/tasks/services/taskService"
    );
    const result = await completeTask({
      id: p.task_id,
      recurrence_rule: p.recurrence_rule ?? null,
      due_date: p.due_date ?? null,
    });
    if (result) {
      setDone("completed");
      toast.success(
        result.status === "completed"
          ? "Task completed"
          : `Recurring task — next due ${result.due_date}`,
      );
    } else {
      toast.error("Could not complete the task");
    }
  };

  const snooze = async () => {
    const { snoozeTask } = await import(
      "@/features/tasks/services/taskUserStateService"
    );
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(9, 0, 0, 0);
    const result = await snoozeTask(p.task_id, until);
    if (result) {
      setDone("snoozed");
      toast.success("Snoozed until tomorrow 9:00");
    } else {
      toast.error("Could not snooze the task");
    }
  };

  return (
    <>
      <Link href={`/tasks/${p.task_id}`} className={chipClass(isOwn)}>
        <ExternalLink className="h-3 w-3" aria-hidden />
        Open task
      </Link>
      {done === null ? (
        <>
          <button type="button" className={chipClass(isOwn)} onClick={complete}>
            <CircleCheck className="h-3 w-3" aria-hidden />
            Complete
          </button>
          <button type="button" className={chipClass(isOwn)} onClick={snooze}>
            <AlarmClock className="h-3 w-3" aria-hidden />
            Snooze 1d
          </button>
        </>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground">
          {done === "completed" ? "Completed" : "Snoozed"}
        </span>
      )}
    </>
  );
}

const RENDERERS: Record<string, ChipRenderer> = {
  agent_drift: (data, ctx) => <AgentDriftChips data={data} isOwn={ctx.isOwn} />,
  open_link: (data, ctx) => <OpenLinkChip data={data} isOwn={ctx.isOwn} />,
  resource_shared: (data) => <ResourceSharedCard data={data} />,
  task_reminder: (data, ctx) => <TaskReminderChips data={data} isOwn={ctx.isOwn} />,
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
