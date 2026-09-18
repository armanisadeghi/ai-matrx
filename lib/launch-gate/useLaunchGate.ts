"use client";

// lib/launch-gate/useLaunchGate.ts
//
// 🚨 A RUN LAUNCHES WITH THE SET THE PERSON SEES, OR IT DOES NOT LAUNCH.
//
// ## The defect this exists to make impossible
//
// `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §9.1
// (2026-09-18). An Expert dropped SEVENTEEN files onto a Rulebook and pressed
// "Turn this into rules". Two files became rules. Fifteen were never submitted
// and nothing anywhere said so.
//
// Nothing was broken in the run. `platform.associations` shows the seventeen
// file→rulebook edges being written ONE AT A TIME, ~0.3 s apart, from
// 03:22:27.70 to 03:22:32.32 — the shared capture toolbar attaches in a serial
// `for (const id of ids) await attach(...)` loop. The run started at
// 03:22:28.57, before the fourth had landed, and the launcher built its payload
// from the association rows that existed AT CLICK TIME. It distilled a prefix
// of the person's own pile, reported `completed`, and every screen downstream
// was telling the truth about a two-resource run nobody had asked for.
//
// ## The rule
//
// A surface whose payload is gathered from asynchronous writes may not fire
// while any of those writes is in flight, and may not fire while a write that
// has LANDED is not yet visible in the set it is about to send. Both halves are
// needed: the first closes the 0.3 s gap between attaches, the second closes
// the gap between an attach resolving and the store's rows reaching this
// render.
//
// And it says so out loud (law #4): a control that quietly refuses is the same
// dead end as one that quietly submits the wrong thing. `blockingReason` is a
// sentence for `GatedActionButton`, and `busyLabel` is what the button itself
// wears while the pile is still arriving.
//
// This is a platform primitive, not the dump panel's private repair: every
// surface that collects a pile and then spends money on it — attachments,
// uploads, staged links, picker selections — has the same gap.

import { useCallback, useRef, useState } from "react";

/** What the gate is counting, in words a person reads. */
export interface LaunchGateNouns {
  /** "source" / "file" / "link" — singular. */
  one: string;
  /** "sources" / "files" / "links" — plural. */
  many: string;
}

const DEFAULT_NOUNS: LaunchGateNouns = { one: "source", many: "sources" };

export interface LaunchGate {
  /** Writes in flight right now. Zero is the only value that may launch. */
  pending: number;
  /**
   * Run one payload-shaping write through the gate. While the promise is
   * unsettled the gate is closed; when it settles and `landed` says the write
   * really took, the gate remembers `key` until the visible set carries it.
   */
  track<T>(
    run: () => Promise<T>,
    settled?: { key: string; landed: (value: T) => boolean },
  ): Promise<T>;
  /** Stop expecting `key` — the person removed it again. */
  forget(key: string): void;
  /** Keys this surface wrote that `visible` does not carry yet. */
  missingFrom(visible: Iterable<string>): string[];
  /**
   * The sentence a launch control shows INSTEAD of firing, or null when the
   * set on screen is the whole set.
   */
  blockingReason(
    visible: Iterable<string>,
    nouns?: LaunchGateNouns,
  ): string | null;
  /** What the button wears while the pile is still arriving, or null. */
  busyLabel(visible: Iterable<string>, nouns?: LaunchGateNouns): string | null;
}

export function useLaunchGate(): LaunchGate {
  const [pending, setPending] = useState(0);
  // Keys are rendered through `missingFrom`, which every consumer calls during
  // render, so this has to be state rather than a ref — a ref would settle the
  // gate without repainting the button that is gated on it.
  const [landed, setLanded] = useState<readonly string[]>([]);
  // The in-flight count as the CALLBACKS see it: two attaches that start in the
  // same tick must both be counted even before React has re-rendered either.
  const inFlight = useRef(0);

  const track = useCallback(
    async <T,>(
      run: () => Promise<T>,
      settled?: { key: string; landed: (value: T) => boolean },
    ): Promise<T> => {
      inFlight.current += 1;
      setPending(inFlight.current);
      try {
        const value = await run();
        if (settled && settled.landed(value)) {
          setLanded((keys) =>
            keys.includes(settled.key) ? keys : [...keys, settled.key],
          );
        }
        return value;
      } finally {
        inFlight.current = Math.max(0, inFlight.current - 1);
        setPending(inFlight.current);
      }
    },
    [],
  );

  const forget = useCallback((key: string) => {
    setLanded((keys) => keys.filter((k) => k !== key));
  }, []);

  const missingFrom = useCallback(
    (visible: Iterable<string>): string[] => {
      const seen = visible instanceof Set ? visible : new Set(visible);
      return landed.filter((key) => !seen.has(key));
    },
    [landed],
  );

  const blockingReason = useCallback(
    (visible: Iterable<string>, nouns: LaunchGateNouns = DEFAULT_NOUNS) => {
      if (pending > 0) {
        return pending === 1
          ? `One ${nouns.one} is still attaching — starting now would leave it out.`
          : `${pending} ${nouns.many} are still attaching — starting now would leave them out.`;
      }
      const missing = missingFrom(visible).length;
      if (missing > 0) {
        return missing === 1
          ? `One just-attached ${nouns.one} has not appeared in the list yet — one moment.`
          : `${missing} just-attached ${nouns.many} have not appeared in the list yet — one moment.`;
      }
      return null;
    },
    [pending, missingFrom],
  );

  const busyLabel = useCallback(
    (visible: Iterable<string>, nouns: LaunchGateNouns = DEFAULT_NOUNS) => {
      if (pending > 0) {
        return `Attaching ${pending} ${pending === 1 ? nouns.one : nouns.many}…`;
      }
      const missing = missingFrom(visible).length;
      if (missing > 0) return "Catching up…";
      return null;
    },
    [pending, missingFrom],
  );

  return { pending, track, forget, missingFrom, blockingReason, busyLabel };
}
