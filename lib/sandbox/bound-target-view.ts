/**
 * bound-target-view — what the compute control SHOWS for the box a
 * conversation is bound to.
 *
 * The rule this file exists to enforce: **a bound conversation always names its
 * box.** Before this, every compute surface rendered the binding only once a
 * live `/api/compute-targets` check had confirmed the box was online
 * (`boundTarget = status === "verified" ? target : null`). Two consequences,
 * both of them the bug Arman reported on 2026-09-14 ("I just opened this chat,
 * which was on a sandbox … it didn't instantly put me on the same sandbox"):
 *
 *   1. On EVERY load the liveness check is a fresh round-trip, so the control
 *      showed no bound box at all until it came back — the chat looked unbound
 *      on first paint even though the row said otherwise.
 *   2. A box that is merely asleep (stopped, restartable) or expired NEVER
 *      became `verified`, so the control silently dropped the binding for the
 *      whole session and offered OTHER boxes with a "+", next to a "Detach"
 *      button for a box it refused to name. The screen could not answer "which
 *      box is this chat on?" — and that question always has an answer, because
 *      the row has one.
 *
 * So liveness DECORATES the binding; it never removes it. The record (backed by
 * `chat.conversation.sandbox_instance_id` / `app_instance_id`) decides WHICH
 * box; this decides how it reads while we check, and once we know.
 */

import type { ComputeTarget } from "@/app/api/compute-targets/route";
import type { SandboxVerificationStatus } from "@/hooks/sandbox/use-verified-binding";
import { sandboxDisplayName } from "@/lib/sandbox/format";

/**
 * How the bound box reads right now.
 *
 * `checking` — the liveness answer hasn't landed yet. Name the box anyway.
 * `online`   — confirmed reachable; this is the only state a turn can route to.
 * `asleep`   — the box exists but is not running (stopped / starting). It can
 *              come back, so "gone" would be a lie and "pick another" is wrong
 *              advice: the remedy is to start it.
 * `gone`     — no such target any more (expired, deleted, someone else's).
 */
export type BoundTargetState = "checking" | "online" | "asleep" | "gone";

export interface BoundTargetView {
  rowId: string;
  /** Always a human label — the live row's name, else the one latched at bind time. */
  name: string;
  kind: "ec2" | "hosted" | "local-pc";
  state: BoundTargetState;
  /** The live row when the targets list carries it (null while checking / gone). */
  target: ComputeTarget | null;
}

export interface BoundTargetInput {
  /** The conversation's binding, straight off the record. */
  ref: {
    rowId: string;
    kind?: "ec2" | "hosted" | "local-pc";
    name?: string;
  } | null;
  /** Verification verdict from `useVerifiedSandboxBinding`. */
  status: SandboxVerificationStatus;
  /** Every target the liveness check returned — `null` while it is in flight. */
  targets: ComputeTarget[] | null;
}

/**
 * A readable last resort: never render a raw uuid at full length — and never
 * a SECOND identity for a box that another surface already named. This routes
 * through the canonical formatter so the short id here is the same short id
 * the canvas pane, the picker and the `+` menu show for the same box.
 */
export function fallbackTargetName(rowId: string): string {
  return sandboxDisplayName({ id: rowId });
}

/**
 * The bound box as the UI must render it — or `null` only when the
 * conversation genuinely has no binding.
 */
export function resolveBoundTargetView({
  ref,
  status,
  targets,
}: BoundTargetInput): BoundTargetView | null {
  if (!ref || status === "none") return null;

  const match = targets?.find((t) => t.id === ref.rowId) ?? null;
  const kind = match?.kind ?? ref.kind ?? "ec2";
  const name = match?.name ?? ref.name ?? fallbackTargetName(ref.rowId);

  let state: BoundTargetState;
  if (!targets) {
    state = "checking";
  } else if (status === "verified") {
    state = "online";
  } else if (match) {
    // The box still exists — it is asleep, not gone. The remedy is to start it.
    state = "asleep";
  } else {
    state = "gone";
  }

  return { rowId: ref.rowId, name, kind, state, target: match };
}

/** One line of plain English for each state — tooltips, strips and aria labels. */
export function describeBoundTargetState(
  view: BoundTargetView,
): { label: string; remedy: string | null } {
  switch (view.state) {
    case "checking":
      return { label: "Checking…", remedy: null };
    case "online":
      return { label: "Connected", remedy: null };
    case "asleep":
      return {
        label: view.kind === "local-pc" ? "Offline" : "Asleep",
        remedy:
          view.kind === "local-pc"
            ? "Start Matrx Local on that computer to use it again."
            : "Start this sandbox to use it again.",
      };
    case "gone":
      return {
        label: "Gone",
        remedy: "This box no longer exists — attach another one.",
      };
  }
}
