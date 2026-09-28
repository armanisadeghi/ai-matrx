"use client";

/**
 * Follow ONE approval row until somebody decides it (lane RUN-PAGE-TAILS,
 * 2026-09-27).
 *
 * A run paused on a held change is decided wherever the person happens to be —
 * the chat card, the table's page, the run page. The run page must carry the
 * run on by itself when the decision was taken somewhere else, so it follows
 * the row: `custom.work_approval_read`, the same door the table's page reads,
 * under the person's own rights.
 *
 * WHY A READ ON A CADENCE AND NOT A REALTIME SUBSCRIPTION. An approval is a
 * `custom.record` row (`data_class = 'work_approval'`). Schema `custom` is
 * doors-only and hash-partitioned, so it cannot sit in the `supabase_realtime`
 * publication (`pnpm check:realtime-publication:list` does not list it); the
 * store's live path is the `custom:table:<table_id>` broadcast, and an approval
 * row has no `table_id`, so `custom.io_outbox_broadcast_stmt` never announces
 * it. Until the database broadcasts approvals, the cadence below is the whole
 * of "live" — every few seconds while the tab is visible, at once when it
 * becomes visible again, and never after the row is decided.
 */

import { useEffect, useState } from "react";

import { recordsDataSource } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";

/** Where an approval row stands. `pending` is the only state still waiting. */
export type ApprovalState = "pending" | "approved" | "declined" | "withdrawn";

const KNOWN: ReadonlySet<string> = new Set(["pending", "approved", "declined", "withdrawn"]);

/** How often a visible page asks while the row is still pending. */
export const APPROVAL_FOLLOW_MS = 4_000;

let sharedDataSource: ReturnType<typeof recordsDataSource> | null = null;
function dataSource(): ReturnType<typeof recordsDataSource> {
  sharedDataSource ??= recordsDataSource(createClient());
  return sharedDataSource;
}

/** Where an approval row stands, and when it was decided (null while pending). */
export interface ApprovalStanding {
  state: ApprovalState;
  decidedAt: string | null;
}

/** The row's standing, or null when it cannot be read (the caller keeps its fallback). */
export async function readApprovalStanding(
  organizationId: string,
  approvalId: string,
): Promise<ApprovalStanding | null> {
  const read = (await dataSource().rpc(
    "work_approval_read",
    { p_organization_id: organizationId, p_approval_id: approvalId },
    { schema: "custom" },
  )) as { data?: { state?: unknown; decided_at?: unknown } | null; error?: unknown };
  if (read.error) return null;
  const state = read.data?.state;
  if (typeof state !== "string" || !KNOWN.has(state)) return null;
  const decidedAt = read.data?.decided_at;
  return { state: state as ApprovalState, decidedAt: typeof decidedAt === "string" && decidedAt ? decidedAt : null };
}

/** The row's state, or null when it cannot be read (the caller keeps its fallback). */
export async function readApprovalState(
  organizationId: string,
  approvalId: string,
): Promise<ApprovalState | null> {
  return (await readApprovalStanding(organizationId, approvalId))?.state ?? null;
}

/**
 * What a card says about a decision somebody already took — here, in another tab, on the
 * table's page or the run page (lane HANDOVER, 2026-09-27: a reopened chat offered Approve on a
 * change approved minutes earlier, and pressing it answered "That was already approved").
 */
export function standingSentence(standing: ApprovalStanding): string | null {
  const at = standing.decidedAt ? new Date(standing.decidedAt) : null;
  const on =
    at && !Number.isNaN(at.getTime())
      ? ` on ${at.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
      : "";
  if (standing.state === "approved") return `Approved${on}. The change was made.`;
  if (standing.state === "declined") return `Refused${on}. Nothing was changed.`;
  if (standing.state === "withdrawn") return "This request was withdrawn, so nothing was changed.";
  return null;
}

/**
 * The approval's state, followed while it is pending. `null` until the first
 * answer (or while the row is unreadable — the reason goes to the console, and
 * the page keeps its "carry on here" fallback on screen).
 */
export function useApprovalDecision(
  organizationId: string | null,
  approvalId: string | null,
): ApprovalState | null {
  return useApprovalStanding(organizationId, approvalId)?.state ?? null;
}

/** The same follow, with when the decision was taken. */
export function useApprovalStanding(
  organizationId: string | null,
  approvalId: string | null,
): ApprovalStanding | null {
  const [state, setState] = useState<ApprovalStanding | null>(null);

  useEffect(() => {
    if (!organizationId || !approvalId) return undefined;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let decided = false;

    const visible = () =>
      typeof document === "undefined" || document.visibilityState !== "hidden";

    const schedule = () => {
      if (!live || decided) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(ask, APPROVAL_FOLLOW_MS);
    };

    async function ask() {
      timer = null;
      if (!live || decided || inFlight) return;
      if (!visible()) return; // resumed by the visibility listener
      inFlight = true;
      try {
        const next = await readApprovalStanding(organizationId!, approvalId!);
        if (!live) return;
        if (next === null) {
          console.warn(
            `[held-approval] Could not read approval ${approvalId}, so this page cannot tell ` +
              "whether it was decided elsewhere. Press \"carry on here\" once it has been.",
          );
        } else {
          setState(next);
          if (next.state !== "pending") decided = true;
        }
      } catch (error: unknown) {
        console.warn(`[held-approval] Reading approval ${approvalId} failed.`, error);
      } finally {
        inFlight = false;
      }
      schedule();
    }

    const onVisibility = () => {
      if (visible()) void ask();
    };

    void ask();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [organizationId, approvalId]);

  return state;
}
