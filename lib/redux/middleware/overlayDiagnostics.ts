// lib/redux/middleware/overlayDiagnostics.ts
//
// Diagnostic instrumentation for the overlay/window-panels render pipeline.
//
// The render contract — dispatch(openOverlay) → OverlaySurface mounts the
// registered component — has no built-in failure signal. If the dispatch is
// accepted but the component never appears (key-name mismatch between data
// and component props, lazy-load failure, registry typo), the user sees an
// empty window with zero indication of cause.
//
// This middleware closes that gap. For every openOverlay/toggleOverlay it:
//   1. Records the dispatched payload in `pendingRenders`.
//   2. (Dev only) Immediately warns if the dispatched data keys are not a
//      subset of the registry entry's defaultData keys — this is the exact
//      class of bug that took down agentRunWindow when "agentId" drifted
//      from the component's "initialAgentId".
//   3. Schedules a verifyRender check 1500ms later. If by then the slot is
//      still open AND OverlayRenderProbe never reported a mount via
//      markRendered(), it emits a console.error with the full diagnostic
//      payload (data keys vs defaultData keys, lazy-load error if captured,
//      dispatch call-site stack in dev).
//
// markRendered() is called from OverlayRenderProbe inside OverlaySurface and
// clears the pending entry — that is how we know "the component actually
// mounted." reportLazyLoadError() is called from OverlayErrorBoundary so a
// chunk-load failure surfaces with the same actionable context.
//
// Production behavior: the timeout error remains active so prod-only failures
// still surface in users' consoles (and any Sentry breadcrumb hook). The
// verbose dev-only pieces (stack capture, key-set warning) are gated out.

import type { Middleware } from "@reduxjs/toolkit";
import { getStaticEntryByOverlayId } from "@/features/window-panels/registry/windowRegistryMetadata";
import { DEFAULT_INSTANCE_ID } from "@/lib/redux/slices/overlaySlice";

const IS_DEV = process.env.NODE_ENV !== "production";

// 1500ms is long enough to cover the slowest legitimate lazy chunk on a
// throttled connection in dev, short enough that the error appears while the
// user is still looking at the broken window.
const RENDER_TIMEOUT_MS = 1500;

interface PendingRender {
  overlayId: string;
  instanceId: string;
  data: unknown;
  dispatchedAt: number;
  /** Only captured in dev — too noisy/expensive for prod. */
  stack: string | undefined;
  timer: ReturnType<typeof setTimeout>;
  /** Set by reportLazyLoadError so verifyRender can include it. */
  lazyLoadError: Error | undefined;
}

const pendingRenders = new Map<string, PendingRender>();
const warnedKeyMismatches = new Set<string>();

const keyOf = (overlayId: string, instanceId: string) =>
  `${overlayId}::${instanceId}`;

/**
 * Called by OverlayRenderProbe when its host overlay component mounts. Clears
 * the pending watch — the render succeeded. Safe to call from any environment.
 */
export function markRendered(overlayId: string, instanceId: string): void {
  const k = keyOf(overlayId, instanceId);
  const pending = pendingRenders.get(k);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingRenders.delete(k);
}

/**
 * Called by OverlayErrorBoundary when the lazy import or initial render
 * throws. We attach the error so the timeout's console.error can include it
 * (and emit a separate, immediate console.error so the failure is visible
 * even if the timeout was already cleared).
 */
export function reportLazyLoadError(
  overlayId: string,
  instanceId: string,
  error: unknown,
): void {
  const k = keyOf(overlayId, instanceId);
  const pending = pendingRenders.get(k);
  const err = error instanceof Error ? error : new Error(String(error));
  if (pending) pending.lazyLoadError = err;
  console.error(
    `[overlayDiagnostics] Lazy load / render error for "${overlayId}" (instance "${instanceId}"):`,
    err,
  );
}

function cancelPending(overlayId: string, instanceId: string): void {
  const k = keyOf(overlayId, instanceId);
  const pending = pendingRenders.get(k);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingRenders.delete(k);
}

function diffKeys(a: readonly string[], b: readonly string[]): string[] {
  const bs = new Set(b);
  return a.filter((k) => !bs.has(k));
}

function dataKeys(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data as Record<string, unknown>);
}

function maybeWarnKeyMismatch(
  overlayId: string,
  instanceId: string,
  data: unknown,
): void {
  if (!IS_DEV) return;
  const entry = getStaticEntryByOverlayId(overlayId);
  if (!entry) return;
  const defaults = entry.defaultData ?? {};
  const defaultKeys = Object.keys(defaults);
  const dispatched = dataKeys(data);
  // Drop instanceId/isOpen/onClose — those are injected by OverlaySurface,
  // not part of the registry contract.
  const RESERVED = new Set(["instanceId", "isOpen", "onClose"]);
  const undeclared = dispatched.filter(
    (k) => !RESERVED.has(k) && !defaultKeys.includes(k),
  );
  if (undeclared.length === 0) return;
  // Warn once per (overlayId, missing-key-set) combination so repeated clicks
  // don't spam the console.
  const warnKey = `${overlayId}::${undeclared.slice().sort().join(",")}`;
  if (warnedKeyMismatches.has(warnKey)) return;
  warnedKeyMismatches.add(warnKey);
  console.warn(
    `[overlayDiagnostics] dispatch for "${overlayId}" (instance "${instanceId}") includes key(s) not declared in registry defaultData: [${undeclared.join(", ")}]. ` +
      `defaultData keys: [${defaultKeys.join(", ")}]. ` +
      `If the window's component expects one of these names but the dispatch sends the other, the prop will arrive as undefined and the window will render empty.`,
  );
}

function buildTimeoutReport(pending: PendingRender): string {
  const entry = getStaticEntryByOverlayId(pending.overlayId);
  const defaults = entry?.defaultData ?? {};
  const defaultKeys = Object.keys(defaults);
  const dispatched = dataKeys(pending.data);
  const inDataNotDefault = diffKeys(dispatched, defaultKeys);
  const inDefaultNotData = diffKeys(defaultKeys, dispatched);
  const ageMs = Date.now() - pending.dispatchedAt;

  const lines: string[] = [
    `[overlayDiagnostics] Overlay dispatched but never rendered: ${pending.overlayId}`,
    `  instanceId: ${pending.instanceId}`,
    `  age: ${ageMs}ms (threshold ${RENDER_TIMEOUT_MS}ms)`,
    `  dispatched data keys: [${dispatched.join(", ") || "<none>"}]`,
    `  registry defaultData keys: [${defaultKeys.join(", ") || "<none>"}]`,
    `  keys in data but not in defaultData (likely typo / stale name): [${inDataNotDefault.join(", ") || "<none>"}]`,
    `  keys in defaultData but not in data (will use defaults): [${inDefaultNotData.join(", ") || "<none>"}]`,
    `  registry entry exists: ${entry ? "yes" : "NO — overlayId not in registry"}`,
  ];
  if (entry) {
    lines.push(`  registry slug: ${entry.slug}`);
    lines.push(`  registry label: ${entry.label}`);
    lines.push(`  registry kind: ${entry.kind}`);
  }
  if (pending.lazyLoadError) {
    lines.push(
      `  lazy-load error: ${pending.lazyLoadError.name}: ${pending.lazyLoadError.message}`,
    );
  } else {
    lines.push(`  lazy-load error: <none captured>`);
  }
  if (pending.stack) {
    lines.push(`  dispatch call site (stack):\n${pending.stack}`);
  }
  return lines.join("\n");
}

function verifyRender(
  overlayId: string,
  instanceId: string,
  getState: () => unknown,
): void {
  const k = keyOf(overlayId, instanceId);
  const pending = pendingRenders.get(k);
  if (!pending) return; // Already cleared by markRendered or close.

  // Confirm the slot is still open — if the user closed it within 1500ms,
  // an unrendered window is moot.
  const state = getState() as {
    overlays?: { overlays?: Record<string, Record<string, { isOpen: boolean }>> };
  };
  const isStillOpen =
    state.overlays?.overlays?.[overlayId]?.[instanceId]?.isOpen === true;

  pendingRenders.delete(k);

  if (!isStillOpen) return; // Closed before render verification; nothing to report.

  console.error(buildTimeoutReport(pending));
}

function isOpenOverlayAction(type: string): boolean {
  return type === "overlays/openOverlay" || type === "overlays/toggleOverlay";
}

function isCloseSpecificOverlayAction(type: string): boolean {
  return type === "overlays/closeOverlay";
}

function isWipeAllOverlaysAction(type: string): boolean {
  return (
    type === "overlays/closeAllOverlays" ||
    type === "overlays/closeAllInstancesOfOverlay"
  );
}

interface OverlayActionPayload {
  overlayId?: string;
  instanceId?: string;
  data?: unknown;
}

export const overlayDiagnosticsMiddleware: Middleware =
  (storeApi) => (next) => (action: unknown) => {
    const result = next(action);

    if (
      !action ||
      typeof action !== "object" ||
      typeof (action as { type?: unknown }).type !== "string"
    ) {
      return result;
    }
    const a = action as { type: string; payload?: OverlayActionPayload };

    if (isOpenOverlayAction(a.type)) {
      const overlayId = a.payload?.overlayId;
      if (!overlayId) return result;
      const instanceId = a.payload?.instanceId ?? DEFAULT_INSTANCE_ID;
      const data = a.payload?.data;

      // After openOverlay reduces, the slot is open. For toggleOverlay we
      // must check whether the toggle opened or closed the slot — if it
      // closed, there's no render to verify.
      const state = storeApi.getState() as {
        overlays?: {
          overlays?: Record<string, Record<string, { isOpen: boolean }>>;
        };
      };
      const isOpen =
        state.overlays?.overlays?.[overlayId]?.[instanceId]?.isOpen === true;
      if (!isOpen) return result;

      maybeWarnKeyMismatch(overlayId, instanceId, data);

      // Replace any prior pending watch for the same slot (reopen with new data).
      cancelPending(overlayId, instanceId);

      const k = keyOf(overlayId, instanceId);
      const stack = IS_DEV ? new Error("dispatch site").stack : undefined;
      const timer = setTimeout(
        () => verifyRender(overlayId, instanceId, storeApi.getState),
        RENDER_TIMEOUT_MS,
      );
      pendingRenders.set(k, {
        overlayId,
        instanceId,
        data,
        dispatchedAt: Date.now(),
        stack,
        timer,
        lazyLoadError: undefined,
      });
      return result;
    }

    if (isCloseSpecificOverlayAction(a.type)) {
      const overlayId = a.payload?.overlayId;
      if (!overlayId) return result;
      const instanceId = a.payload?.instanceId ?? DEFAULT_INSTANCE_ID;
      cancelPending(overlayId, instanceId);
      return result;
    }

    if (isWipeAllOverlaysAction(a.type)) {
      // Cancel every pending watch — we can't know which slots actually
      // closed reactively without re-deriving from state, and a stale error
      // is worse than a missed one.
      for (const pending of pendingRenders.values()) {
        clearTimeout(pending.timer);
      }
      pendingRenders.clear();
      return result;
    }

    return result;
  };
