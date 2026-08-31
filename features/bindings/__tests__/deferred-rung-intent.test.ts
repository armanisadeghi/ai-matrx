/**
 * V1 ROUND 3, BLOCKER R3-1 — one click, one visible question, one outcome.
 *
 * 🚨 Nine repros on both hosts. On a dirty draft, changing the RUNG opened the
 * confirm from inside the Radix Select's own `onValueChange`, while its listbox
 * still carried `data-state="open"` for ~2s. The confirm never appeared, the
 * body stayed pointer-dead 1-11s, THE RUNG CHANGE WAS SILENTLY DROPPED, and the
 * queued confirm fired later on an unrelated click as a stale question.
 *
 * Two earlier attempts failed for instructive reasons, both pinned below:
 *   · a fixed one-frame delay is not a close boundary;
 *   · waiting on the BODY LOCK asks the wrong object — this repo's watchdog
 *     deliberately clears an orphaned lock, and the moment it does the wait
 *     resolves with the listbox still open. One guard's cure satisfied the
 *     other's precondition.
 */

import { whenNoLayerIsOpen } from "@/components/dialogs/confirm/deferred-intent";

/** A controllable clock — no real timers, no flake. */
function fakeClock() {
  let now = 0;
  const queue: Array<{ at: number; id: number; fn: () => void }> = [];
  let nextId = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      queue.push({ at: now + ms, id, fn });
      return id;
    },
    clearTimer: (id: number) => {
      const i = queue.findIndex((t) => t.id === id);
      if (i >= 0) queue.splice(i, 1);
    },
    advance: async (ms: number) => {
      const target = now + ms;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const due = queue.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        queue.splice(queue.indexOf(due), 1);
        now = due.at;
        due.fn();
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
    },
  };
}

describe("the rung intent waits for the Select, then always resolves", () => {
  test("THE REGRESSION: it does not fire while the listbox is still open", async () => {
    const clock = fakeClock();
    let listboxOpen = true;
    const settled: string[] = [];
    const waiter = whenNoLayerIsOpen({
      isOpen: () => listboxOpen,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    void waiter.promise.then((r) => settled.push(r));

    // Radix keeps the listbox open for about two seconds under production
    // scheduling. Nothing may be asked in that window.
    await clock.advance(1900);
    expect(settled).toEqual([]);

    listboxOpen = false;
    await clock.advance(100);
    expect(settled).toEqual(["clear"]);
  });

  test("a body lock cleared by the watchdog does NOT release the wait", async () => {
    // The precise trap the second attempt fell into: the guard clears
    // document.body's orphaned lock, and a body-based wait would resolve here.
    // This wait asks the LAYERS, so an open listbox still holds it.
    const clock = fakeClock();
    document.body.style.removeProperty("pointer-events");
    const settled: string[] = [];
    const waiter = whenNoLayerIsOpen({
      isOpen: () => true, // a layer is still open, whatever the body says
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    void waiter.promise.then((r) => settled.push(r));
    await clock.advance(1000);
    expect(settled).toEqual([]);
    waiter.cancel();
  });

  test("a layer that never closes TIMES OUT — it never waits in silence", async () => {
    const clock = fakeClock();
    const settled: string[] = [];
    const waiter = whenNoLayerIsOpen({
      isOpen: () => true,
      timeoutMs: 4000,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    void waiter.promise.then((r) => settled.push(r));
    await clock.advance(4200);
    // The caller turns this into a sentence and drops the intent; what must
    // never happen is an unresolved wait that surfaces later as an ambush.
    expect(settled).toEqual(["timeout"]);
  });

  test("moving on DISCARDS the intent — it is never banked for a later click", async () => {
    const clock = fakeClock();
    const settled: string[] = [];
    const waiter = whenNoLayerIsOpen({
      isOpen: () => true,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    void waiter.promise.then((r) => settled.push(r));
    await clock.advance(200);
    waiter.cancel(); // the effect tore down: the person navigated or clicked away
    await clock.advance(5000);
    expect(settled).toEqual(["cancelled"]);
    // And nothing resolves afterwards — the stale-question ambush is gone.
    expect(settled).toHaveLength(1);
  });

  test("nothing open: it clears on the next turn, not on a paint", async () => {
    const clock = fakeClock();
    const settled: string[] = [];
    const waiter = whenNoLayerIsOpen({
      isOpen: () => false,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    void waiter.promise.then((r) => settled.push(r));
    await clock.advance(0);
    expect(settled).toEqual(["clear"]);
  });
});
