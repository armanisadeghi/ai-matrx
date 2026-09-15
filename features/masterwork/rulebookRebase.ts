// features/masterwork/rulebookRebase.ts
//
// 🚨 THE PHANTOM CONFLICT ON A RULEBOOK — why the Reject dialog refused.
//
// Wall W12 (teach-recent-interview, 2026-09-15): on the Rulebook page an
// Expert rejects a draft with a typed reason, and the save comes back "This
// Rulebook changed while you were editing (someone else saved a newer
// version)". Nobody else had touched it. WE had.
//
// Every rules write funnels through `saveRules`, which (a) CASes on the
// `version` the page is holding and (b) fires `pokeUnderstudy` →
// `POST /masterworks/understudy/refresh` on the server. That server hook also
// wakes the Coherence Partner (`rulebook_writes._poke_understudy` →
// `_poke_coherence`), which writes `metadata.coherence` back onto THE SAME
// `platform.rulebook` row a second or two later. `platform._touch_row` bumps
// `version` on that write, so the page's freshly-returned version is stale
// before the Expert has finished reading the toast. The next decision — the
// next Reject, Approve, Improve or Edit — CASes on a number the row no longer
// holds and is refused. Whether it hits is pure timing, which is exactly why
// the first scored run could reject some rules and not others.
//
// That is the phantom conflict the platform concurrency contract already
// names (`@ai-matrx/data` `guardedUpdate`, "THE PHANTOM CONFLICT, and
// `rebase`"): a version the client never learned, on a column it is not
// editing. The answer is not to stop poking coherence — the Partner is
// supposed to run — it is to tell the CAS what this write actually touches.
//
// This module is that answer, and it lives beside `saveRules` (the ONE write
// path, FEATURE.md rule 2) so every surface inherits it: the Reject dialog,
// Request changes, Improve, Edit, Approve, bulk approve, the review wizard,
// the Final Checkup apply/undo, the Oracle tap and the Add-rule window.

import type { Rulebook } from "./types";

/**
 * Order-insensitive structural equality for the JSON we read back out of a
 * jsonb column. Deliberately NOT `JSON.stringify` equality: PostgREST is free
 * to hand back object keys in a different order than the client sent them, and
 * a false "not equal" here would turn a phantom back into a refusal — the
 * exact bug this file exists to kill.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    return x.every((item, i) => sameJson(item, y[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  // `undefined` and an absent key are the same thing on the wire, so compare
  // only the keys that actually carry a value.
  const keys = (o: Record<string, unknown>) =>
    Object.keys(o).filter((k) => o[k] !== undefined);
  const xk = keys(x);
  const yk = keys(y);
  if (xk.length !== yk.length) return false;
  return xk.every((k) => k in y && sameJson(x[k], y[k]));
}

/** The columns a single `saveRules` call is allowed to change. */
export interface RulebookWriteTouches {
  /** Always true — `rules` is what this write path exists to change. */
  rules: true;
  /** The write replaces `sections` too. */
  sections: boolean;
  /** The write replaces the whole `metadata` column (the Final Checkup). */
  metadata: boolean;
}

/** The row as the server holds it after a CAS missed. */
export interface RulebookCurrentRow {
  rules?: unknown;
  sections?: unknown;
  metadata?: unknown;
}

/**
 * Did the version move for a column this write does NOT touch?
 *
 * "Phantom" means: the fields I am about to change, as the server holds them
 * right now, still equal the base my edit was made against — so nobody
 * disagreed with me, I simply never learned about a write to another column.
 * `guardedUpdate` retries such a write once against the live version.
 *
 * A write that replaces `metadata` wholesale (the Final Checkup reads it,
 * modifies it and hands the finished object back) is NOT phantom-safe when
 * `metadata` moved: rebasing there would silently drop whatever the Coherence
 * Partner just wrote. It is reported as the real conflict it is.
 */
export function isPhantomRulebookMiss(args: {
  base: Pick<Rulebook, "rules" | "sections" | "metadata">;
  touches: RulebookWriteTouches;
  current: RulebookCurrentRow;
}): boolean {
  const { base, touches, current } = args;
  if (!sameJson(current.rules ?? [], base.rules ?? [])) return false;
  if (touches.sections && !sameJson(current.sections ?? {}, base.sections ?? {}))
    return false;
  if (touches.metadata && !sameJson(current.metadata ?? null, base.metadata ?? null))
    return false;
  return true;
}
