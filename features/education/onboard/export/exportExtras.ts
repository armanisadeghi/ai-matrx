// features/education/onboard/export/exportExtras.ts
//
// Joins per-card state into a JSON export so the round-trip is genuinely
// lossless: FSRS review state from education.item_mastery (so a re-imported
// backup keeps its due dates) and media refs from the fc_card → file
// association edges. Two batch reads, never per-card round-trips.

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import type {
  DeckExportExtras,
  PortableMediaRef,
  PortableScheduling,
} from "./deckFormats";

const MEDIA_ROLES = new Set(["illustration", "photo", "diagram", "chart", "video_ref"]);

/** Fetch scheduling + media extras for a deck's cards. Loud-but-not-fatal:
 * an export never fails because extras couldn't be loaded. */
export async function fetchDeckExportExtras(cardIds: string[]): Promise<DeckExportExtras> {
  const extras: DeckExportExtras = {};
  if (cardIds.length === 0) return extras;

  try {
    const { data, error } = await supabase
      .schema("education")
      .from("item_mastery")
      .select("item_id, due_at, stability, difficulty, lapses, attempt_count, last_review")
      .eq("item_type", "fc_card")
      .in("item_id", cardIds);
    if (error) throw error;
    const byId = new Map<string, PortableScheduling>();
    for (const m of data ?? []) {
      if (!m.due_at || m.stability == null) continue;
      byId.set(m.item_id, {
        due_at: m.due_at,
        stability: Number(m.stability),
        difficulty: m.difficulty != null ? Number(m.difficulty) : 5,
        lapses: m.lapses ?? 0,
        reps: m.attempt_count ?? 0,
        last_review: m.last_review ?? null,
      });
    }
    if (byId.size > 0) extras.schedulingByCardId = byId;
  } catch (e) {
    console.error("[fetchDeckExportExtras] scheduling read failed:", e);
  }

  try {
    const res = await associationsService.listForSources("fc_card", cardIds, "file");
    if (res.ok) {
      const byId = new Map<string, PortableMediaRef[]>();
      for (const edge of res.data.edges) {
        if (!MEDIA_ROLES.has(edge.role ?? "")) continue;
        const meta = (edge.metadata ?? {}) as {
          face?: "front" | "back" | null;
          kind?: "image" | "audio" | "video" | null;
          source_name?: string | null;
        };
        const list = byId.get(edge.sourceId) ?? [];
        list.push({
          file_id: edge.targetId,
          face: meta.face ?? undefined,
          kind: meta.kind ?? undefined,
          source_name: meta.source_name ?? undefined,
        });
        byId.set(edge.sourceId, list);
      }
      if (byId.size > 0) extras.mediaByCardId = byId;
    }
  } catch (e) {
    console.error("[fetchDeckExportExtras] media edges read failed:", e);
  }

  return extras;
}
