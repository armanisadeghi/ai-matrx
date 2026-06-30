// features/flashcards/data/fcService.ts
//
// Canonical flashcard CONTENT service: fc_set / fc_card / fc_detail in the
// `education` schema, plus their relationship edges (membership, lineage) via the
// association chokepoint. Reads/writes go direct through supabase-js (RLS-gated);
// edges go through `associationsService` (the sole `platform.associations` caller).
// Never throws — every method returns `FcResult<T>`.
//
// Performance/mastery is NOT here: studying a card writes the shared study spine
// (`features/education/study`), keyed by item_type='fc_card'.

"use client";

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import type { RootState } from "@/lib/redux/store";
import { EDGE_ROLE } from "./types";
import type {
  FcResult,
  FcSetRow,
  FcCardRow,
  FcDetailRow,
  FcDetailInsert,
  NewSetInput,
  NewCardInput,
  CardWithDetails,
  SetWithCards,
} from "./types";

const EDU = () => supabase.schema("education");

/** Active-context org (falls back to the user's personal org inside the selector). */
function getOrgId(explicit?: string): string | null {
  if (explicit) return explicit;
  const store = getStoreSingleton();
  if (!store) return null;
  return selectEffectiveOrganizationId(store.getState() as RootState) ?? null;
}

function fail<T>(context: string, error: unknown): FcResult<T> {
  console.error(`[fcService] ${context}:`, error);
  return { data: null, error: `${context}: ${describeError(error)}` };
}

/** Surface PostgREST/DB errors loudly (message + details + hint + code), not "[object Object]". */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint && `hint: ${e.hint}`, e.code && `(${e.code})`]
      .filter(Boolean)
      .join(" — ") || "Unknown error";
  }
  return "Unknown error";
}

export const fcService = {
  // ─── SETS ───────────────────────────────────────────────────────────────
  async createSet(input: NewSetInput): Promise<FcResult<FcSetRow>> {
    try {
      const orgId = getOrgId(input.orgId);
      if (!orgId) return fail("createSet", "no active organization");
      const { data, error } = await EDU()
        .from("fc_set")
        .insert({
          organization_id: orgId,
          name: input.name,
          description: input.description ?? null,
          topic: input.topic ?? null,
          lesson: input.lesson ?? null,
          difficulty: input.difficulty ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) return fail("createSet", error);
      return { data: data as FcSetRow, error: null };
    } catch (e) {
      return fail("createSet", e);
    }
  },

  async getSet(setId: string): Promise<FcResult<FcSetRow>> {
    try {
      // maybeSingle (not single): an RLS-hidden or missing row returns no row
      // with NO error, so we surface a clear not-found message instead of the
      // opaque empty-string PostgREST error that `.single()` raises.
      const { data, error } = await EDU()
        .from("fc_set")
        .select("*")
        .eq("id", setId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return fail("getSet", error);
      if (!data) return { data: null, error: "Set not found or you don't have access to it" };
      return { data: data as FcSetRow, error: null };
    } catch (e) {
      return fail("getSet", e);
    }
  },

  /** Sets owned by or shared with the current user (RLS-filtered), recent first. */
  async listSets(): Promise<FcResult<FcSetRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) return fail("listSets", error);
      return { data: (data ?? []) as FcSetRow[], error: null };
    } catch (e) {
      return fail("listSets", e);
    }
  },

  // ─── CARDS (+ membership / lineage edges) ────────────────────────────────
  /**
   * Insert cards and attach each to the set as an ordered `member` edge. When a
   * card carries `source`, also create a `source` lineage edge (fc_card → file).
   * `startPosition` lets callers append to an existing set. Org is resolved by the
   * assoc RPC's generic source fallback, so no org need be threaded for the edges.
   */
  async addCards(
    setId: string,
    cards: NewCardInput[],
    opts: { orgId?: string; startPosition?: number } = {},
  ): Promise<FcResult<FcCardRow[]>> {
    try {
      if (cards.length === 0) return { data: [], error: null };
      const orgId = getOrgId(opts.orgId);
      if (!orgId) return fail("addCards", "no active organization");
      const rows = cards.map((c) => ({
        organization_id: orgId,
        front: c.front,
        back: c.back,
        card_kind: c.card_kind ?? "basic",
        difficulty: c.difficulty ?? null,
        topic: c.topic ?? null,
        lesson: c.lesson ?? null,
        personal_notes: c.personal_notes ?? null,
      }));
      const { data, error } = await EDU().from("fc_card").insert(rows).select("*");
      if (error) return fail("addCards", error);
      const created = (data ?? []) as FcCardRow[];

      const base = opts.startPosition ?? 0;
      // Membership + optional lineage edges. Edges are not transactional with the
      // insert; a failed edge is logged but does not lose the card (loud, not fatal).
      await Promise.all(
        created.map(async (card, i) => {
          const member = await associationsService.add({
            sourceType: "fc_card",
            sourceId: card.id,
            targetType: "fc_set",
            targetId: setId,
            role: EDGE_ROLE.member,
            position: base + i,
            orgId: opts.orgId,
          });
          if (!member.ok) console.error("[fcService.addCards] member edge failed:", member);

          const src = cards[i].source;
          if (src?.file_id) {
            const lineage = await associationsService.add({
              sourceType: "fc_card",
              sourceId: card.id,
              targetType: "file",
              targetId: src.file_id,
              role: EDGE_ROLE.source,
              orgId: opts.orgId,
              metadata: {
                processed_document_id: src.processed_document_id ?? null,
                chunk_id: src.chunk_id ?? null,
                page: src.page ?? null,
              } as never,
            });
            if (!lineage.ok)
              console.error("[fcService.addCards] lineage edge failed:", lineage);
          }
        }),
      );
      return { data: created, error: null };
    } catch (e) {
      return fail("addCards", e);
    }
  },

  /** Create a set and its cards in one call (the from-topic / from-chat shape). */
  async createSetWithCards(
    input: NewSetInput,
    cards: NewCardInput[],
  ): Promise<FcResult<SetWithCards>> {
    const setRes = await this.createSet(input);
    if (!setRes.data) return { data: null, error: setRes.error };
    const set = setRes.data;
    const cardsRes = await this.addCards(set.id, cards, { orgId: set.organization_id });
    if (cardsRes.error) return { data: null, error: cardsRes.error };
    return this.getSetWithCards(set.id);
  },

  // ─── READ: a set with its ordered cards + details ────────────────────────
  async getSetWithCards(setId: string): Promise<FcResult<SetWithCards>> {
    try {
      const setRes = await this.getSet(setId);
      if (!setRes.data) return { data: null, error: setRes.error };

      // Membership edges (cards → this set), ordered by position.
      const edgesRes = await associationsService.listForTargets("fc_set", [setId]);
      if (!edgesRes.ok) return fail("getSetWithCards", "failed to load membership edges");
      const members = edgesRes.data.edges
        .filter((e) => e.sourceType === "fc_card" && e.role === EDGE_ROLE.member)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const cardIds = members.map((e) => e.sourceId);
      const posByCard = new Map(members.map((e) => [e.sourceId, e.position ?? null]));

      if (cardIds.length === 0) return { data: { set: setRes.data, cards: [] }, error: null };

      const { data: cardRows, error: cardErr } = await EDU()
        .from("fc_card")
        .select("*")
        .in("id", cardIds)
        .is("deleted_at", null);
      if (cardErr) return fail("getSetWithCards", cardErr);

      const { data: detailRows, error: detErr } = await EDU()
        .from("fc_detail")
        .select("*")
        .in("card_id", cardIds)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (detErr) return fail("getSetWithCards", detErr);

      const detailsByCard = new Map<string, FcDetailRow[]>();
      for (const d of (detailRows ?? []) as FcDetailRow[]) {
        const arr = detailsByCard.get(d.card_id) ?? [];
        arr.push(d);
        detailsByCard.set(d.card_id, arr);
      }

      const byId = new Map((cardRows ?? []).map((c) => [(c as FcCardRow).id, c as FcCardRow]));
      const cards: CardWithDetails[] = cardIds
        .map((id) => byId.get(id))
        .filter((c): c is FcCardRow => !!c)
        .map((c) => ({
          ...c,
          position: posByCard.get(c.id) ?? null,
          details: detailsByCard.get(c.id) ?? [],
        }));

      return { data: { set: setRes.data, cards }, error: null };
    } catch (e) {
      return fail("getSetWithCards", e);
    }
  },

  async updateCard(
    cardId: string,
    patch: Partial<Pick<FcCardRow, "front" | "back" | "card_kind" | "difficulty" | "topic" | "lesson" | "personal_notes">>,
  ): Promise<FcResult<FcCardRow>> {
    try {
      const { data, error } = await EDU()
        .from("fc_card")
        .update(patch)
        .eq("id", cardId)
        .select("*")
        .single();
      if (error) return fail("updateCard", error);
      return { data: data as FcCardRow, error: null };
    } catch (e) {
      return fail("updateCard", e);
    }
  },

  // ─── DETAILS (helper / example / spoken / ...) ───────────────────────────
  async addDetail(
    cardId: string,
    kind: string,
    text: string,
    opts: { audio_file_id?: string; generated_by?: "agent" | "user"; position?: number } = {},
  ): Promise<FcResult<FcDetailRow>> {
    try {
      // fc_detail is a composition child: organization_id is inherited from the
      // parent card by the _inherit_org trigger, so it is intentionally omitted
      // here. The generated Insert type marks it required (NOT NULL, trigger-
      // filled, no column default), hence the deliberate cast.
      const payload = {
        card_id: cardId,
        kind,
        text,
        audio_file_id: opts.audio_file_id ?? null,
        generated_by: opts.generated_by ?? "agent",
        position: opts.position ?? 0,
        generation_status: opts.audio_file_id ? "audio_ready" : "text_ready",
      };
      const { data, error } = await EDU()
        .from("fc_detail")
        .insert(payload as unknown as FcDetailInsert)
        .select("*")
        .single();
      if (error) return fail("addDetail", error);
      return { data: data as FcDetailRow, error: null };
    } catch (e) {
      return fail("addDetail", e);
    }
  },

  async getDetails(cardId: string): Promise<FcResult<FcDetailRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("fc_detail")
        .select("*")
        .eq("card_id", cardId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) return fail("getDetails", error);
      return { data: (data ?? []) as FcDetailRow[], error: null };
    } catch (e) {
      return fail("getDetails", e);
    }
  },
};
