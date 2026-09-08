/**
 * The host's message-action SURFACES — the app-shaped half of an actionable
 * message, handed to `@ai-matrx/messaging` as `actionRenderers`.
 *
 * The package draws chips for actions that ask a QUESTION. These kinds do not:
 * a shared-resource card, a link out to a report, a task reminder with app
 * services behind it, an access request whose answer is a permission grant.
 * Only this app can draw those, so this app draws them — INSIDE the package's
 * bubble, through the package's seam. There is no second message renderer here.
 *
 * The version gate stays the package's: a kind at a version not listed below
 * renders NOTHING, which is what lets a newer sender ship before every reader
 * has caught up. Our senders write no `version` field, and the package reads a
 * missing version as 1 — so every renderer here lists `[1]`.
 *
 * Adding a kind: write the payload type in `../types`, add the component, add
 * the row at the bottom. Every bubble carrying that kind gets the surface.
 */

"use client";

import { useState } from "react";
import {
  AlarmClock,
  CircleCheck,
  CircleSlash,
  ExternalLink,
  FileChartColumn,
  Flag,
  KeyRound,
  PenLine,
  Search,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type {
  AccessRequestStatus,
  RequestedLevel,
} from "@/features/access-gate/types";
import { useOpenAgentFindUsagesWindow } from "@/features/overlays/openers/agentFindUsagesWindow";
import type { MessageActionRenderer } from "@ai-matrx/messaging/react";
import type {
  AccessRequestActionPayload,
  AgentDriftActionPayload,
  OpenLinkActionPayload,
  ResourceSharedActionPayload,
  TaskReminderActionPayload,
} from "@/features/messaging/types";
import { getResourceSharePath } from "@/utils/permissions/registry";
import { getResourceIcon } from "@/features/sharing/resourceIcons";
import { EntityCard } from "@/features/tool-call-visualization/renderers/_shared-entity/EntityCard";
import { SettingRequestActionButtons } from "@/features/access-gate/components/SettingRequestActionButtons";
import { ResourceActionRequestButtons } from "@/features/access-gate/components/ResourceActionRequestButtons";
import { isJsonObject } from "@/types/json";

interface SurfaceProps<TPayload> {
  payload: TPayload;
  isOwn: boolean;
}

function chipClass(isOwn: boolean): string {
  return [
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
    "transition-colors",
    isOwn
      ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
      : "border-border bg-background/70 text-foreground hover:bg-background",
  ].join(" ");
}

function AgentDriftChips({ payload, isOwn }: SurfaceProps<AgentDriftActionPayload>) {
  const openFindUsages = useOpenAgentFindUsagesWindow();
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
function ResourceSharedCard({ payload }: SurfaceProps<ResourceSharedActionPayload>) {
  const p = payload;
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
        // No "Open" when the resource has no page — a link to nowhere in a
        // shared-with-you card is worse than no button.
        actions={href ? [{ label: "Open", icon: ExternalLink, href }] : []}
      />
    </div>
  );
}

/**
 * `open_link` — the generic single deep-link chip for system DMs that point
 * the user at an in-app page (external URLs are refused).
 */
function OpenLinkChip({ payload, isOwn }: SurfaceProps<OpenLinkActionPayload>) {
  const p = payload;
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
function TaskReminderChips({ payload, isOwn }: SurfaceProps<TaskReminderActionPayload>) {
  const p = payload;
  const [done, setDone] = useState<"completed" | "snoozed" | null>(null);
  if (!p?.task_id) return null;

  const complete = async () => {
    const { completeTask } =
      await import("@/features/tasks/services/taskService");
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
    const { snoozeTask } =
      await import("@/features/tasks/services/taskUserStateService");
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

/**
 * `access_request` — someone is asking to get into something you own.
 *
 * The DM IS the approval surface. The owner grants, declines, or reports right
 * here, without going to find a queue — which is the difference between a
 * request that gets answered and one that rots. The requester's own copy of the
 * message shows the same card with no buttons, so they can see what they sent.
 */
function AccessRequestChips({ payload, isOwn }: SurfaceProps<AccessRequestActionPayload>) {
  const p = payload;
  const currentUserId = useAppSelector(selectUserId);
  const [done, setDone] = useState<AccessRequestStatus | null>(null);
  const [busy, setBusy] = useState(false);
  if (!p?.request_id) return null;

  if (p.request_kind === "resource_action" && p.action_key) {
    return (
      <ResourceActionRequestButtons
        requestId={p.request_id}
        actionKey={p.action_key}
        href={p.href}
        itemName={p.entity_title ?? p.entity_label ?? "this item"}
        isOwn={isOwn}
        compact
      />
    );
  }

  // The sender sees their own ask; only the recipient can answer it.
  if (isOwn) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-primary-foreground/80">
        <KeyRound className="h-3 w-3" aria-hidden />
        Access requested
      </span>
    );
  }

  async function decide(
    decision: "grant" | "decline",
    level?: RequestedLevel,
  ) {
    setBusy(true);
    try {
      const { decideAccessRequest } =
        await import("@/features/access-gate/service/accessRequests");
      const result = await decideAccessRequest({
        requestId: p.request_id,
        decision,
        level,
        currentUserId,
      });
      setDone(result.status);
      toast.success(
        result.already
          ? "This was already answered."
          : decision === "grant"
            ? `Access granted${p.entity_title ? ` to ${p.entity_title}` : ""}.`
            : "Request declined.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't do that.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    setBusy(true);
    try {
      const { reportAccessRequest } =
        await import("@/features/access-gate/service/accessRequests");
      await reportAccessRequest(p.request_id);
      setDone("reported");
      toast.success("Reported. They can't ask about this again.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't do that.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground">
        {done === "granted"
          ? "Access granted"
          : done === "declined"
            ? "Declined"
            : done === "reported"
              ? "Reported"
              : "Answered"}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={chipClass(isOwn)}
        disabled={busy}
        onClick={() => void decide("grant", "viewer")}
      >
        <CircleCheck className="h-3 w-3" aria-hidden />
        Let them view
      </button>
      <button
        type="button"
        className={chipClass(isOwn)}
        disabled={busy}
        onClick={() => void decide("grant", "editor")}
      >
        <PenLine className="h-3 w-3" aria-hidden />
        Let them edit
      </button>
      <button
        type="button"
        className={chipClass(isOwn)}
        disabled={busy}
        onClick={() => void decide("grant", "admin")}
      >
        <KeyRound className="h-3 w-3" aria-hidden />
        Give full access
      </button>
      <button
        type="button"
        className={chipClass(isOwn)}
        disabled={busy}
        onClick={() => void decide("decline")}
      >
        <CircleSlash className="h-3 w-3" aria-hidden />
        Decline
      </button>
      <button
        type="button"
        className={chipClass(isOwn)}
        disabled={busy}
        onClick={() => void report()}
      >
        <Flag className="h-3 w-3" aria-hidden />
        Report
      </button>
    </>
  );
}

function SettingAccessRequestChips({ payload, isOwn }: SurfaceProps<unknown>) {
  if (!isJsonObject(payload)) return null;
  const p = payload;
  if (
    typeof p.request_id !== "string" ||
    typeof p.href !== "string" ||
    typeof p.action_key !== "string"
  ) {
    return null;
  }
  return (
    <SettingRequestActionButtons
      requestId={p.request_id}
      href={p.href}
      actionKey={p.action_key}
      isOwn={isOwn}
      compact
    />
  );
}

/**
 * The kinds this build can draw. A kind absent from this list, or present at a
 * version not listed, renders nothing at all — never a chip that fails when
 * pressed.
 */
export const MESSAGE_ACTION_SURFACES: readonly MessageActionRenderer<never>[] = [
  { kind: "access_request", versions: [1], render: AccessRequestChips },
  { kind: "agent_drift", versions: [1], render: AgentDriftChips },
  { kind: "open_link", versions: [1], render: OpenLinkChip },
  { kind: "resource_shared", versions: [1], render: ResourceSharedCard },
  { kind: "setting_access_request", versions: [1], render: SettingAccessRequestChips },
  { kind: "task_reminder", versions: [1], render: TaskReminderChips },
] as readonly MessageActionRenderer<never>[];
