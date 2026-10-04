// features/entitlements/usage-gate/usageGate.ts
//
// THE USAGE GATE — the client's request-path half. Binding rules:
// common-docs/systems/platform/entitlements-knobs/USAGE-GATE.md (9-12).
//
//   • cached `ok` / `unknown` → the call goes out with ZERO added work;
//   • cached `near` / `over`  → ONE fresh read first; only a fresh `over` blocks
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

const BLOCKED_MESSAGE = "You've reached your AI usage limit for now.";

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
  if (fresh.state !== "over") return { allowed: true };

  const window = bindingWindow(fresh);
  dispatch(setUsageRefusal(window));
  return { allowed: false, window, message: BLOCKED_MESSAGE };
}

// ── After a call: stale + one debounced background refresh ──────────────────

/** Calls ending close together (a multi-call turn) share one refresh. */
const REFRESH_DEBOUNCE_MS = 1_500;
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
  }, REFRESH_DEBOUNCE_MS);
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
 */
export function applyServerUsageState(
  dispatch: AnyDispatch,
  raw: unknown,
): boolean {
  const snapshot = parseUsageSnapshot(raw);
  if (!snapshot) return false;
  dispatch(setUsageSnapshot({ snapshot, fetchedAt: Date.now() }));
  return true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Is this refused request the server's usage refusal (USAGE-GATE.md rule 2)?
 * Recognised by the documented contract fields — `fix_action: "upgrade_plan"`
 * beside a usage state, or an HTTP 402 — at any envelope depth.
 */
export function isServerUsageRefusal(status: number, body: unknown): boolean {
  if (status === 402) return true;
  const visit = (v: unknown, depth: number): boolean => {
    if (!isRecord(v) || depth > 3) return false;
    if (
      v.error === USAGE_LIMIT_REACHED ||
      v.code === USAGE_LIMIT_REACHED ||
      v.error_type === USAGE_LIMIT_REACHED
    ) {
      return true;
    }
    if (v.fix_action === "upgrade_plan" && parseUsageSnapshot(v)) return true;
    return visit(v.detail, depth + 1) || visit(v.serverDetail, depth + 1);
  };
  return visit(body, 0);
}

/**
 * The server refused on usage: hold `over` (from the body when it carries the
 * state) and open the limit dialog.
 */
export function applyServerUsageRefusal(
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
