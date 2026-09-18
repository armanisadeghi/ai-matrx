// features/window-panels/detail/pageSeedHandoff.ts
//
// 🚨 NEW-9 (VERIFY-U-P1-R3) — WHAT THE OPENER ALREADY KNEW REACHES THE PAGE.
//
// `/detail/<type>/<id>` is a route, so the only things it is handed are its two
// params: the page route passed `seed: null` ALWAYS, and every record whose type
// has no single canonical table therefore arrived with nothing to show — the
// honest absent state, even when the surface that opened it was holding the
// record's name the whole time.
//
// A name is not put in the URL: it is not identity, it goes stale, and a shared
// link would carry one person's copy of it. Instead the in-app navigation leaves
// it here — module scope, so it dies with the tab — and the page route takes it
// once, on arrival. A pasted or bookmarked link finds nothing here and shows what
// the record's own loader answers, which is the correct difference between the
// two cases.
//
// SINGLE USE, and bounded: one entry per record, dropped when taken and when it
// ages out, so a stale name can never be shown for a record opened again later.

import type { DetailRef, DetailSeed } from "@/lib/detail/types";

/** How long a handed-over name stays usable. One client navigation, generously. */
const SEED_TTL_MS = 30_000;

/** Bound on the map, so a tab that navigates all day cannot grow it forever. */
const MAX_PENDING = 32;

const pending = new Map<string, { seed: DetailSeed; at: number }>();

function key(ref: DetailRef): string {
  return `${ref.type}.${ref.id}`;
}

/** Leave what this tab already knows about the record it is navigating to. */
export function stashPageSeed(ref: DetailRef, seed: DetailSeed | null | undefined): void {
  const name = seed?.name?.trim() || null;
  const about = seed?.about?.trim() || null;
  if (!name && !about) return;
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest !== undefined) pending.delete(oldest);
  }
  pending.set(key(ref), { seed: { name, about }, at: Date.now() });
}

/** Take it, once. `null` for a link that came from outside this tab. */
export function takePageSeed(ref: DetailRef): DetailSeed | null {
  const id = key(ref);
  const hit = pending.get(id);
  if (!hit) return null;
  pending.delete(id);
  return Date.now() - hit.at > SEED_TTL_MS ? null : hit.seed;
}
