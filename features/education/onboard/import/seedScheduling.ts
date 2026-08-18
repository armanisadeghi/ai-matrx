// features/education/onboard/import/seedScheduling.ts
//
// The ONE client call site for `edu_import_review_history` — the sanctioned
// seed path for imported spaced-repetition state (IC-11 §3). Shared by the
// Anki importer and the Matrx portable-JSON round-trip so a re-imported backup
// keeps its due dates too. The RPC is owner-checked and never overwrites an
// existing mastery row.

import { supabase } from "@/utils/supabase/client";
import type { PortableScheduling } from "../export/deckFormats";

export interface SchedulingSeedItem {
  cardId: string;
  scheduling: PortableScheduling;
  /** Provenance stamp stored in item_mastery.metadata.imported_from. */
  source: string;
}

/** Current FSRS retrievability given stability and days elapsed since review. */
export function retrievabilityOf(stabilityDays: number, elapsedDays: number): number {
  if (stabilityDays <= 0) return 0.9;
  // FSRS forgetting curve: R = (1 + factor * t/S)^(-decay), classic parameters.
  const decay = 0.5;
  const factor = Math.pow(0.9, -1 / decay) - 1;
  return Math.pow(1 + (factor * Math.max(0, elapsedDays)) / stabilityDays, -decay);
}

/** Seed imported review state; returns how many cards were seeded (0 on error —
 * loud in the console, never fatal to the import that already landed). */
export async function seedImportedScheduling(items: SchedulingSeedItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const now = Date.now();
  const payload = items.map(({ cardId, scheduling: s, source }) => {
    const elapsedDays = s.last_review
      ? (now - new Date(s.last_review).getTime()) / 86400000
      : 0;
    return {
      item_id: cardId,
      due_at: s.due_at,
      stability: s.stability,
      difficulty: Number(s.difficulty.toFixed(2)),
      retrievability: Number(retrievabilityOf(s.stability, elapsedDays).toFixed(4)),
      lapses: s.lapses,
      reps: s.reps,
      last_review: s.last_review ?? null,
      source,
    };
  });
  const { data, error } = await supabase.rpc("edu_import_review_history", {
    p_items: payload,
  });
  if (error) {
    console.error("[seedImportedScheduling] review-history seed failed:", error);
    return 0;
  }
  return (data as { seeded?: number } | null)?.seeded ?? 0;
}
