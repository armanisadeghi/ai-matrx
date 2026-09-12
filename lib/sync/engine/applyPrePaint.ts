/**
 * lib/sync/engine/applyPrePaint.ts
 *
 * Runtime mirror of the inline pre-paint script in
 * `components/SyncBootScript.tsx`. Takes the same `PrePaintDescriptor[]` and
 * applies the described DOM mutations imperatively against a live slice state
 * object. Invoked by the sync middleware after every action that changes a
 * slice whose policy declares `prePaint` descriptors.
 *
 * Why this exists: `SyncBootScript` runs ONCE before React hydration, reading
 * from localStorage. Without a runtime counterpart, Redux state can change
 * (local toggle, inbound broadcast, rehydrate) but the DOM class/attribute
 * would stay at whatever pre-paint set on page load. The theme slice exposes
 * this most visibly — a toggle updates state + broadcasts + persists, but the
 * `<html>` class does not flip until the next full reload.
 *
 * Pre-paint descriptors are the single source of truth for "how does this
 * slice mirror itself to the DOM?" — this function honours that exactly.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrePaintDescriptor } from "../types";

/**
 * Apply one or more pre-paint descriptors against a live slice state object.
 *
 * No-op on the server (no `document`). No-op if `data` is null/undefined.
 * Never throws — DOM APIs are guarded and descriptor evaluation catches.
 */
export function applyPrePaintDescriptors(
    descriptors: readonly PrePaintDescriptor[],
    data: Record<string, unknown> | null | undefined,
): void {
    if (typeof document === "undefined") return;
    if (descriptors.length === 0) return;

    for (const d of descriptors) {
        const target = d.target === "body" ? document.body : document.documentElement;
        if (!target) continue;

        const value =
            data && typeof data === "object" ? (data as Record<string, unknown>)[d.fromKey] : undefined;

        if (d.kind === "attribute") {
            if (typeof value === "string" && value !== d.systemValue && d.allowed.includes(value)) {
                target.setAttribute(d.attribute, value);
                continue;
            }
            if (d.systemFallback) {
                const matches = evalSystemMedia(d.systemFallback.mediaQuery);
                if (
                    matches &&
                    d.systemFallback.applyWhenMatches &&
                    d.systemFallback.whenMatchesValue
                ) {
                    target.setAttribute(d.attribute, d.systemFallback.whenMatchesValue);
                    continue;
                }
                if (!matches && d.systemFallback.whenDoesNotMatchValue) {
                    target.setAttribute(d.attribute, d.systemFallback.whenDoesNotMatchValue);
                    continue;
                }
            }
            target.setAttribute(d.attribute, d.default);
            continue;
        }

        if (d.kind === "classToggle") {
            // Gate `systemFallback` on the *absence* of a stored value, not on
            // !matched. Otherwise picking "light" while the OS prefers dark
            // causes the fallback to re-add the `.dark` class, overriding the
            // user's explicit choice. Mirrors the gating in the `attribute`
            // branch above (which uses an early `continue` for the same
            // semantics). Pin: apply-prePaint.test.ts has a regression test
            // covering this case.
            let add: boolean;
            if (typeof value === "string" && value !== d.systemValue) {
                add = value === d.whenEquals;
            } else if (d.systemFallback) {
                const mq = evalSystemMedia(d.systemFallback.mediaQuery);
                add = mq ? Boolean(d.systemFallback.applyWhenMatches) : false;
            } else {
                add = false;
            }
            if (add) target.classList.add(d.className);
            else target.classList.remove(d.className);
        }
    }
}

function evalSystemMedia(query: string): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try {
        return window.matchMedia(query).matches;
    } catch {
        return false;
    }
}
