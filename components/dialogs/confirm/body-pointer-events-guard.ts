"use client";

/**
 * components/dialogs/confirm/body-pointer-events-guard.ts
 *
 * 🚨 THE PAGE-KILLER (V1 finding R2-1, 2026-08-31).
 *
 * Every Radix modal layer — AlertDialog, Dialog, Select, DropdownMenu — parks
 * `pointer-events: none` on `document.body` while it is open and restores it
 * when it closes, using `react-remove-scroll`'s inline style on the body. Two
 * layers whose lifetimes OVERLAP restore in the wrong order and the last
 * writer wins: the body is left dead while nothing is open.
 *
 * The shape that produced it here: the rung picker is a Radix `Select`, and its
 * `onValueChange` synchronously opens the global confirm (the F3 fix). The
 * Select's own body lock and the AlertDialog's overlap; dismissing the confirm
 * by EITHER button leaves `document.body { pointer-events: none }` with zero
 * dialogs in the DOM. The adversary drove it four times on both hosts: every
 * control on the page still LOOKS enabled and none of them respond — including
 * the organization picker the screen has just told you to use. Only a reload
 * recovers. That is the "a control is absent or honest, never dead" law broken
 * across an entire page at once.
 *
 * WHY A WATCHDOG AND NOT A CALL-SITE FIX. Deferring this one confirm to the
 * next tick would fix this one screen and leave the class standing: the shape
 * is "a Radix selection opens a modal", and there is nothing about the binding
 * UI in it. This runs beside the confirm host, which is mounted once in every
 * provider tree, and covers every layer combination in the app, present and
 * future.
 *
 * It is deliberately conservative: it acts ONLY when the body is locked AND no
 * modal layer of any kind is in the document, so a legitimately-open dialog is
 * never touched. And it is LOUD — a repair means two layers really did fight,
 * which is a defect worth seeing, not a thing to fix quietly.
 */

import { useEffect } from "react";

/**
 * Any layer that legitimately locks the body. If ONE of these is in the
 * document, `pointer-events: none` is correct and we do nothing.
 */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  "[data-radix-popper-content-wrapper]",
].join(",");

/**
 * 🚨 PRESENT IS NOT OPEN (independent walk, 2026-08-31: the guard repaired the
 * body on only 2 of 6 deliberate probes).
 *
 * The first cut declined whenever a matching element merely EXISTED in the
 * document. Two things made that wrong. `[data-radix-focus-guard]` is a
 * sentinel Radix leaves behind, not a layer, and it was in the list — so on any
 * page that had ever opened an overlay the guard silently disqualified itself
 * forever. And a mounted-but-closed dialog or listbox still matches its role
 * selector while being invisible. Both read as "a layer is open" when nothing
 * was, which is indistinguishable from a guard that is not armed at all — and
 * that is precisely how the walk had to describe it.
 *
 * So a layer only counts when it is actually RENDERED: Radix marks the open
 * ones `data-state="open"`, and anything without that stamp must still occupy
 * space to be believed. A guard whose refusal cannot be distinguished from its
 * absence is not a guard.
 */
export function hasOpenLayer(doc: Document = document): boolean {
  for (const el of Array.from(doc.querySelectorAll(OPEN_LAYER_SELECTOR))) {
    // 🚨 ONLY AN EXPLICITLY OPEN LAYER COUNTS. The previous cut fell back to
    // "no state stamp, but it occupies space → treat as open", and that one
    // clause is what made the guard repair EXACTLY ONCE PER PAGE MOUNT: the
    // moment a person opened and closed any dropdown, some laid-out leftover
    // matching `[role=…]` satisfied the fallback, `hasOpenLayer` answered true
    // for the rest of the page's life, and every later orphan went unrepaired.
    // The second independent walk measured precisely that — probe 1 repairs,
    // probes 2-8 leave the body dead — and it is worse than no guard, because
    // the first repair makes it look present.
    //
    // Radix stamps `data-state` on every layer it opens, and the body lock is
    // Radix/react-remove-scroll's doing in the first place, so an unstamped
    // element is not the thing that locked the body. Requiring the stamp is
    // both stricter and more correct than guessing from geometry.
    if (el.getAttribute("data-state") !== "open") continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    return true;
  }
  return false;
}

/** How many times this session had to repair the body. Read by the scream. */
let repairs = 0;

/**
 * Radix removes the visible layer before react-remove-scroll releases the
 * body's inline lock. Treating that brief teardown gap as an orphan produces
 * a false repair (and a false system_error) on an ordinary Select close.
 */
export const ORPHANED_BODY_LOCK_GRACE_MS = 50;

export function createBodyPointerEventsRepairScheduler(
  repair: () => boolean = () => restoreBodyPointerEventsIfOrphaned(),
  setTimer: (callback: () => void, delay: number) => number = (callback, delay) =>
    window.setTimeout(callback, delay),
  clearTimer: (timer: number) => void = (timer) => window.clearTimeout(timer),
): { schedule: () => void; cancel: () => void } {
  let queued: number | null = null;
  return {
    schedule() {
      // Debounce, do not merely deduplicate. Radix's later body-style mutation
      // proves the apparent orphan was normal teardown and starts a fresh
      // quiet window in which the lock will already be gone.
      if (queued !== null) clearTimer(queued);
      queued = setTimer(() => {
        queued = null;
        repair();
      }, ORPHANED_BODY_LOCK_GRACE_MS);
    },
    cancel() {
      if (queued !== null) clearTimer(queued);
      queued = null;
    },
  };
}

/**
 * The whole rule, as a pure function so it can be proven failing-then-passing
 * without a MutationObserver, a Radix tree or a browser.
 *
 * Returns true when it actually repaired something.
 */
export function restoreBodyPointerEventsIfOrphaned(
  doc: Document = document,
): boolean {
  const body = doc.body;
  if (!body) return false;
  if (body.style.pointerEvents !== "none") return false;
  if (hasOpenLayer(doc)) return false;

  body.style.removeProperty("pointer-events");
  repairs += 1;
  // LOUD ONCE PER SESSION, with the remedy. A repair is a real defect — two
  // layers fought — and the first one is reported in full; after that the
  // counter carries it (`bodyPointerEventsRepairCount()`), because a guard
  // that reprints the same paragraph on every rung change is noise, and noise
  // is how a scream stops being heard.
  //
  // 🚨 EVERY repair says something; only the ESSAY is deduplicated (walk,
  // 2026-08-31: the diagnostic logged ZERO times across a session in which
  // repairs demonstrably happened, so nobody could tell whether the guard had
  // done the work or something else had). A guard that repairs silently is
  // back to being indistinguishable from a guard that is absent — the whole
  // defect this file exists to avoid. The first repair carries the full cause
  // and remedy; every one after it is a countable one-liner.
  //
  // 🚨 WARN, NOT ERROR — and the distinction is the point (V2 round 3).
  // `globalErrorCapture` wraps `console.error` in production and feeds the
  // Error Inspector, so every successful repair painted a red "1 error" chip
  // over an action that had just WORKED: the person picked an offered value,
  // the pick succeeded, the guard quietly fixed a layer bug, and the screen
  // reported a failure that never happened. A screen that cries error after a
  // success is lying in the other direction.
  //
  // This stays fully loud to the audience that can act on it — the console
  // still carries the cause, the remedy and a count — but a repair the person
  // never noticed is not their error. `console.warn` is not captured.
  if (repairs === 1) {
    console.warn(
      "[modal-layers] document.body was left pointer-events:none with no modal layer open — every control on the page was dead. Restored. Cause is two overlapping Radix layers (typically a Select whose selection synchronously opens a Dialog); the durable fix is to let the first layer finish closing before opening the second.",
    );
  } else {
    console.warn(`[modal-layers] repaired an orphaned body lock (#${repairs}).`);
  }
  return true;
}

/**
 * IS ANY MODAL LAYER ACTUALLY OPEN RIGHT NOW? Exported because two different
 * problems need the same answer and must not answer it differently: this guard
 * decides whether an orphaned body lock is safe to clear, and
 * `after-current-layer-closes.ts` decides whether it is safe to OPEN a new
 * layer. One predicate, or the two drift and each is right about a different
 * DOM.
 */
export const isAnyModalLayerOpen = hasOpenLayer;

/** For tests only — the counter is session state, not app state. */
export function __resetBodyPointerEventsRepairs(): void {
  repairs = 0;
}

export function bodyPointerEventsRepairCount(): number {
  return repairs;
}

/**
 * Mounted once, beside the confirm host. Watches the two things that can put
 * the body into the bad state: the inline style itself, and a layer leaving the
 * document. The check is deferred a frame so a close/open handoff (one dialog
 * replacing another) is never mistaken for an orphan.
 */
export function useBodyPointerEventsGuard(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    //
    // 🚨 NEVER SCHEDULE THE REPAIR ON requestAnimationFrame (walk, 2026-08-31:
    // 8/8 probes eventually repaired, but two of them took 4.5s and ~15-20s
    // against a 1.5s bar). rAF is SUSPENDED while a tab is hidden and
    // coalesced under load, so the one thing standing between a person and a
    // dead page was tied to the clock most likely to stop. A dead page is not
    // a paint — it does not need a frame, it needs a turn of the event loop.
    const repairScheduler = createBodyPointerEventsRepairScheduler();
    const schedule = repairScheduler.schedule;
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
    });
    // A slow teardown can set the lock a frame or two AFTER the last mutation
    // this observer sees, and then nothing ever re-checks. A cheap low-rate
    // sweep closes that window; it reads two properties and does nothing at
    // all unless the body is actually locked with no layer up.
    const sweep = setInterval(() => {
      restoreBodyPointerEventsIfOrphaned();
    }, 500);
    // Portals mount into <body>, but a layer can also be removed from deeper in
    // the tree; a pointerdown that lands on nothing is the other symptom, and
    // it costs nothing to re-check then.
    document.addEventListener("pointerdown", schedule, true);
    // Timers are throttled hard while a tab is hidden, so the moment it comes
    // back is exactly when a lock may have been sitting unrepaired: check then,
    // before the person's first click lands on a dead page.
    document.addEventListener("visibilitychange", schedule);
    return () => {
      observer.disconnect();
      clearInterval(sweep);
      document.removeEventListener("pointerdown", schedule, true);
      document.removeEventListener("visibilitychange", schedule);
      repairScheduler.cancel();
    };
  }, []);
}
