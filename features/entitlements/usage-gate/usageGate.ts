// features/entitlements/usage-gate/usageGate.ts
//
// THE USAGE GATE — the client's request-path half. Binding rules:
// common-docs/systems/platform/entitlements-knobs/USAGE-GATE.md (9-12).
//
//   • cached `ok` / `unknown` → the call goes out with ZERO added work;
//   • cached `near` / `over`  → ONE fresh read first; only a fresh `over` with
//     enforcement on blocks
//     (a cached `over` alone never blocks — a top-up, an upgrade or another
//     device must never be missed);
//   • every call end          → mark stale + debounced BACKGROUND refresh,
//     never awaited by anything;
//   • server notifications     → `applyServerUsageState` replaces the answer.
//
// Called from the two AI choke points: `runAiStream` (packages/chat — the only
// place that opens an AI stream) and `callApi` for AI turn paths. Never derives
// a state; every level comes from `billing.user_usage_state`.

import {
  markUsageStale,
  setUsageRefusal,
  setUsageSnapshot,
  type UsageGateState,
} from "../state/entitlementsSlice";
import {
  GUEST_AI_ALLOWANCE_USED,
  noticeGuestAiAllowanceRefusal,
} from "@/lib/guest/guest-ai-allowance";
import { readUsageSnapshot } from "./usageRead";
import {
  bindingWindow,
  parseUsageSnapshot,
  type UsageWindow,
} from "./usageState";

type AnyDispatch = (action: unknown) => unknown;

/** The slice of root state the gate reads — structural so the chat package's
 *  `ChatRootState` and the app `RootState` both satisfy it. */
interface UsageGateRoot {
  entitlements?: { usageGate?: UsageGateState };
  userAuth?: { id?: string | null };
}

/** Machine code of a client-side stop (stream error_type / callApi error code). */
export const USAGE_LIMIT_REACHED = "usage_limit_reached" as const;

export type UsageGateVerdict =
  | { allowed: true }
  | { allowed: false; window: UsageWindow | null; message: string };

export const USAGE_BLOCKED_MESSAGE = "You've reached your AI usage limit for now.";

function signedInUserId(root: UsageGateRoot): string | null {
  return root.userAuth?.id ?? null;
}

/**
 * Decide whether one outgoing AI call may go out. Zero work unless the held
 * answer is `near` or `over`.
 */
export async function checkUsageBeforeAiCall(
  dispatch: AnyDispatch,
  getState: () => unknown,
): Promise<UsageGateVerdict> {
  const root = getState() as UsageGateRoot;
  const held = root.entitlements?.usageGate?.state ?? "unknown";
  if (held !== "near" && held !== "over") return { allowed: true };
  // Guests have no browser session to read with — the server decides for them.
  if (!signedInUserId(root)) return { allowed: true };

  const fresh = await readUsageSnapshot();
  if (!fresh) return { allowed: true };
  dispatch(setUsageSnapshot({ snapshot: fresh, fetchedAt: Date.now() }));
  // Same switch as the server: over only blocks while enforcement is on.
  if (fresh.state !== "over" || !fresh.enforced) return { allowed: true };

  const window = bindingWindow(fresh);
  dispatch(setUsageRefusal(window));
  return { allowed: false, window, message: USAGE_BLOCKED_MESSAGE };
}

// ── After a call: stale + one debounced background refresh ──────────────────

/**
 * How long after a call ends the background refresh waits. The server banks a
 * run's spend when the run SETTLES, which lands after the stream's last byte;
 * a read sooner returns the pre-spend state and would mark it fresh. Calls
 * ending inside the window share one refresh, and a settled server answer
 * (the `usage_state_changed` directive) cancels it — the server already said.
 */
export const REFRESH_AFTER_CALL_MS = 8_000;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A call ended (any outcome). Marks the answer stale and schedules ONE
 * background refresh. Returns immediately; nothing may await the refresh.
 */
export function noteAiCallEnded(
  dispatch: AnyDispatch,
  getState: () => unknown,
): void {
  const root = getState() as UsageGateRoot;
  if (!signedInUserId(root)) return;
  dispatch(markUsageStale());
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshUsageInBackground(dispatch, getState);
  }, REFRESH_AFTER_CALL_MS);
}

/** Background refresh — fire-and-forget; a failure leaves the held answer. */
export async function refreshUsageInBackground(
  dispatch: AnyDispatch,
  getState: () => unknown,
): Promise<void> {
  if (!signedInUserId(getState() as UsageGateRoot)) return;
  const fresh = await readUsageSnapshot();
  if (fresh) dispatch(setUsageSnapshot({ snapshot: fresh, fetchedAt: Date.now() }));
}

/** Test seam: drop a pending debounced refresh. */
export function cancelPendingUsageRefreshForTests(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

// ── Server notifications ────────────────────────────────────────────────────

/**
 * A usage state the SERVER sent (the `usage_state_changed` directive, an
 * `info` stream event with code `usage_state`, or a refusal body). Returns true
 * when it carried a state and Redux was updated.
 *
 * `settled: true` — the answer was computed AFTER a run settled (the
 * directive). It is newer than anything the pending after-call read could
 * return, so that read is dropped. An `info` event is sent at the run's first
 * paid call — before the spend — and never cancels it.
 */
export function applyServerUsageState(
  dispatch: AnyDispatch,
  raw: unknown,
  opts: { settled?: boolean } = {},
): boolean {
  const snapshot = parseUsageSnapshot(raw);
  if (!snapshot) return false;
  if (opts.settled && refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  dispatch(setUsageSnapshot({ snapshot, fetchedAt: Date.now() }));
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Who a refusal is for: a person on a plan, or a guest past the allowance. */
export type UsageRefusalKind = "person" | "guest";

const REFUSAL_CODE_KEYS = ["error", "code", "error_type"] as const;
const REFUSAL_NESTS = ["detail", "details", "serverDetail"] as const;

function refusalCodeIn(body: unknown): UsageRefusalKind | null {
  const visit = (v: unknown, depth: number): UsageRefusalKind | null => {
    if (!isRecord(v) || depth > 3) return null;
    for (const key of REFUSAL_CODE_KEYS) {
      if (v[key] === GUEST_AI_ALLOWANCE_USED) return "guest";
    }
    for (const key of REFUSAL_CODE_KEYS) {
      if (v[key] === USAGE_LIMIT_REACHED) return "person";
    }
    if (v.fix_action === "upgrade_plan" && parseUsageSnapshot(v)) {
      return "person";
    }
    for (const key of REFUSAL_NESTS) {
      const hit = visit(v[key], depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return visit(body, 0);
}

/**
 * Is this refused request (an HTTP failure, or a stream `error` event with
 * `status` null) the server's usage refusal (USAGE-GATE.md "Contract"), and
 * whose? The guest code always wins; a refusal for a caller with no signed-in
 * user, or whose state names the `guest` plan, is a guest's whatever its code;
 * an HTTP 402 is a usage refusal even when its body names nothing.
 */
export function classifyUsageRefusal(
  status: number | null,
  body: unknown,
  getState: () => unknown,
): UsageRefusalKind | null {
  const coded = refusalCodeIn(body);
  if (coded === "guest") return "guest";
  if (!coded && status !== 402) return null;
  if (!signedInUserId(getState() as UsageGateRoot)) return "guest";
  if (parseUsageSnapshot(body)?.planKey === "guest") return "guest";
  return "person";
}

/**
 * The server refused on usage: hold `over` (from the body when it carries the
 * state) and open the limit dialog.
 */
function applyPersonRefusal(
  dispatch: AnyDispatch,
  getState: () => unknown,
  body: unknown,
): void {
  const snapshot = parseUsageSnapshot(body);
  if (snapshot) {
    dispatch(setUsageSnapshot({ snapshot, fetchedAt: Date.now() }));
    dispatch(setUsageRefusal(bindingWindow(snapshot)));
    return;
  }
  const held = (getState() as UsageGateRoot).entitlements?.usageGate;
  const window =
    held?.windows.find((w) => w.period === held.bindingPeriod) ??
    held?.windows[0] ??
    null;
  dispatch(setUsageRefusal(window));
  // The body named no numbers — read them in the background for the dialog.
  void refreshUsageInBackground(dispatch, getState);
}

/**
 * Show the ONE answer for a classified refusal — never both:
 *   person → hold `over` + the limit / upgrade dialog;
 *   guest  → the guest sign-up reminder (lib/guest/guest-ai-allowance.ts),
 *            never the upgrade dialog, never a plan state in Redux.
 * The reminder overlay is a singleton, so the capture sink noticing the same
 * refusal again re-opens it rather than stacking a second one.
 */
export function applyUsageRefusal(
  kind: UsageRefusalKind,
  dispatch: AnyDispatch,
  getState: () => unknown,
  body: unknown,
  userMessage?: string | null,
): void {
  if (kind === "guest") {
    noticeGuestAiAllowanceRefusal({
      code: GUEST_AI_ALLOWANCE_USED,
      raw: body,
      ...(userMessage ? { userMessage } : {}),
    });
    return;
  }
  applyPersonRefusal(dispatch, getState, body);
}

/**
 * THE ONE HANDLER every request path calls on a failed response: classify the
 * refusal and show its one answer (person → `over` + limit dialog; guest →
 * sign-up reminder). Returns the kind, or null when it was no usage refusal.
 *
 * `status` 402 counts as a refusal even with a bare body (the AI paths that
 * know the call was paid AI pass it); a path that cannot know that passes
 * `null`, so only a body carrying the refusal code counts.
 */
export function noticeUsageRefusal(
  status: number | null,
  body: unknown,
  dispatch: AnyDispatch,
  getState: () => unknown,
  userMessage?: string | null,
): UsageRefusalKind | null {
  const kind = classifyUsageRefusal(status, body, getState);
  if (kind) applyUsageRefusal(kind, dispatch, getState, body, userMessage);
  return kind;
}

/** The machine code a classified refusal travels under. */
export function usageRefusalCode(kind: UsageRefusalKind): string {
  return kind === "guest" ? GUEST_AI_ALLOWANCE_USED : USAGE_LIMIT_REACHED;
}
