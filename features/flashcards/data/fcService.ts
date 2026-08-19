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
import type { Json } from "@/types/database.types";
import {
  mergeJsonColumn,
  type JsonObject,
} from "@/lib/supabase/mergeJsonColumn";
import { associationsService } from "@/features/scopes/service/associationsService";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
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

/** The narrow row shape a card jsonb merge reads and writes back. */
interface CardJsonRow {
  id: string;
  version: number;
  metadata?: Json | null;
  dynamic_content?: Json | null;
}

interface SetMetadataRow {
  id: string;
  version: number;
  metadata?: Json | null;
}

/**
 * Resolve the org for a flashcard write. The canonical `ensureOrgId` rides the
 * user's ACTIVE org (header selection, else personal) and never returns null —
 * it screams + falls back to the personal-org RPC if Redux somehow lacks it, so
 * a write is never blocked on an unhydrated store.
 */
function resolveOrgId(explicit?: string): Promise<string> {
  return ensureOrgId(explicit);
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
    const e = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return (
      [
        e.message,
        e.details,
        e.hint && `hint: ${e.hint}`,
        e.code && `(${e.code})`,
      ]
        .filter(Boolean)
        .join(" — ") || "Unknown error"
    );
  }
  return "Unknown error";
}

export const fcService = {
  // ─── SETS ───────────────────────────────────────────────────────────────
  async createSet(input: NewSetInput): Promise<FcResult<FcSetRow>> {
    try {
      const orgId = await resolveOrgId(input.orgId);
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

  async updateSet(
    setId: string,
    patch: Partial<
      Pick<FcSetRow, "name" | "description" | "topic" | "lesson" | "difficulty">
    >,
  ): Promise<FcResult<FcSetRow>> {
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .update(patch)
        .eq("id", setId)
        .select("*")
        .single();
      if (error) return fail("updateSet", error);
      return { data: data as FcSetRow, error: null };
    } catch (e) {
      return fail("updateSet", e);
    }
  },

  /**
   * Phase 7 — persist (or clear) the set's generated audio overview. Callers
   * MUST pass a durable `file_id`, never a raw/signed URL (media-durability
   * doctrine) — `AudioOverviewSection` resolves one from the podcast run's
   * `audio_stream_end.file_id` (falling back to `fileIdFromUserFilesUrl`)
   * before calling this.
   */
  async updateSetAudioOverview(
    setId: string,
    fileId: string | null,
  ): Promise<FcResult<FcSetRow>> {
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .update({ audio_overview_file_id: fileId })
        .eq("id", setId)
        .select("*")
        .single();
      if (error) return fail("updateSetAudioOverview", error);
      return { data: data as FcSetRow, error: null };
    } catch (e) {
      return fail("updateSetAudioOverview", e);
    }
  },

  /** Phase 1A — flip a set's share visibility (personal/internal/link/public). */
  async updateSetVisibility(
    setId: string,
    visibility: FcSetRow["visibility"],
  ): Promise<FcResult<FcSetRow>> {
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .update({ visibility })
        .eq("id", setId)
        .select("*")
        .single();
      if (error) return fail("updateSetVisibility", error);
      return { data: data as FcSetRow, error: null };
    } catch (e) {
      return fail("updateSetVisibility", e);
    }
  },

  /**
   * Merge set metadata without dropping keys written by another surface.
   * Public-library classification (`exam_slug`, curation provenance, etc.)
   * shares this column with folders/import metadata, so a blind spread/write
   * is not safe.
   */
  async mergeSetMetadata(
    setId: string,
    merge: (current: JsonObject) => JsonObject,
  ): Promise<FcResult<null>> {
    const SELECT = "id, version, metadata";
    const result = await mergeJsonColumn<SetMetadataRow>({
      fetchCurrent: () =>
        EDU()
          .from("fc_set")
          .select(SELECT)
          .eq("id", setId)
          .is("deleted_at", null)
          .maybeSingle<SetMetadataRow>(),
      readColumn: (row) => row.metadata ?? null,
      merge,
      applyUpdate: ({ value, expectedVersion, nextVersion }) =>
        EDU()
          .from("fc_set")
          .update({ metadata: value, version: nextVersion })
          .eq("id", setId)
          .eq("version", expectedVersion)
          .select(SELECT)
          .maybeSingle<SetMetadataRow>(),
    });
    if (result.status === "saved") return { data: null, error: null };
    if (result.status === "error")
      return fail("mergeSetMetadata", result.error);
    return fail(
      "mergeSetMetadata",
      result.status === "not_found"
        ? "That set is no longer available"
        : "Another edit kept winning — the set metadata was not updated",
    );
  },

  /** Soft-delete a set (RLS/ownership-gated by the update itself). */
  async deleteSet(setId: string): Promise<FcResult<null>> {
    try {
      const { error } = await EDU()
        .from("fc_set")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", setId);
      if (error) return fail("deleteSet", error);
      return { data: null, error: null };
    } catch (e) {
      return fail("deleteSet", e);
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
      if (!data)
        return {
          data: null,
          error: "Set not found or you don't have access to it",
        };
      return { data: data as FcSetRow, error: null };
    } catch (e) {
      return fail("getSet", e);
    }
  },

  /**
   * Sets owned by or shared with the current user (RLS-filtered), recent first.
   *
   * VIEW LAW: this is a DELIBERATE blended view (mine + org-visible +
   * public `visibility`), not an accidental bare list — RLS still bounds
   * it, but the union is intentional for the flashcards home page. Splitting
   * into explicit Mine/Org/Shared tabs is a UX change, not a bug fix; when
   * that lands, wire `applyListScope` here instead of this comment.
   */
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

  /** Resolve set names for session history rows (batch, RLS-filtered). */
  async getSetNamesByIds(
    setIds: string[],
  ): Promise<FcResult<Record<string, string>>> {
    const unique = [...new Set(setIds.filter(Boolean))];
    if (unique.length === 0) return { data: {}, error: null };
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .select("id, name")
        .in("id", unique)
        .is("deleted_at", null);
      if (error) return fail("getSetNamesByIds", error);
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[row.id] = row.name;
      return { data: map, error: null };
    } catch (e) {
      return fail("getSetNamesByIds", e);
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
      const orgId = await resolveOrgId(opts.orgId);
      const rows = cards.map((c) => ({
        organization_id: orgId,
        front: c.front,
        back: c.back,
        card_kind: c.card_kind ?? "basic",
        difficulty: c.difficulty ?? null,
        topic: c.topic ?? null,
        lesson: c.lesson ?? null,
        personal_notes: c.personal_notes ?? null,
        // Columnless extras (e.g. tags) ride the jsonb metadata — never dropped.
        // The P0 TrustEnvelope (citations + confidence) persists under
        // metadata.trust so the card viewer can render <SourceCitations/>.
        metadata: {
          ...(c.metadata ?? {}),
          ...(c.trust ? { trust: c.trust } : {}),
        },
        // Rich-variant payload (matching pairs, …) → the existing jsonb column.
        ...(c.dynamic_content != null
          ? { dynamic_content: c.dynamic_content }
          : {}),
      }));
      const { data, error } = await EDU()
        .from("fc_card")
        .insert(rows)
        .select("*");
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
          if (!member.ok)
            console.error("[fcService.addCards] member edge failed:", member);

          // Media edges (imported Anki media, captures): fc_card → file per ref.
          for (const m of cards[i].media ?? []) {
            const mediaEdge = await associationsService.add({
              sourceType: "fc_card",
              sourceId: card.id,
              targetType: "file",
              targetId: m.file_id,
              role:
                m.role === "photo" ? EDGE_ROLE.photo : EDGE_ROLE.illustration,
              orgId: opts.orgId,
              metadata: {
                face: m.face ?? null,
                kind: m.kind ?? null,
                source_name: m.source_name ?? null,
              } as never,
            });
            if (!mediaEdge.ok)
              console.error(
                "[fcService.addCards] media edge failed:",
                mediaEdge,
              );
          }

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
              console.error(
                "[fcService.addCards] lineage edge failed:",
                lineage,
              );
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
    const cardsRes = await this.addCards(set.id, cards, {
      orgId: set.organization_id,
    });
    if (cardsRes.error) return { data: null, error: cardsRes.error };
    return this.getSetWithCards(set.id);
  },

  // ─── Single-writer contract for agent-generated decks (D-WP3) ────────────
  //
  // A generation surface (from-topic / from-source / convert deck) runs a
  // headless agent whose stream ALSO materializes its flashcard render block
  // through FLASHCARDS_CANONICAL_ADAPTER — two independent writers for one
  // deck. The contract that keeps them to ONE fc_set row:
  //   • every headless generation runs in its own fresh conversation, so the
  //     conversation id IS the run's identity;
  //   • a surface save goes through `createGeneratedSetForConversation`, which
  //     ADOPTS the adapter's set if the adapter won the race (updates
  //     name/topic/difficulty on it) and otherwise creates the set stamped
  //     `metadata.source_system="cx_conversation"` / `source_id=<cid>`;
  //   • the adapter, before creating, looks up that cx_conversation stamp and
  //     LINKS to the surface's set instead of creating a twin.
  // Ordinary multi-deck chat conversations are untouched: only surface saves
  // ever stamp cx_conversation, and the adopt lookup matches only
  // adapter-generated rows (`metadata.generation="chat_render_block"`).

  /**
   * The set the chat-materialization adapter created for this conversation's
   * render block, if it won the race (adopt target for a surface save).
   */
  async findChatGeneratedSetForConversation(
    conversationId: string,
  ): Promise<FcResult<FcSetRow | null>> {
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .select("*")
        .eq("metadata->>conversation_id", conversationId)
        .eq("metadata->>generation", "chat_render_block")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (error) return fail("findChatGeneratedSetForConversation", error);
      return { data: (data as FcSetRow | null) ?? null, error: null };
    } catch (e) {
      return fail("findChatGeneratedSetForConversation", e);
    }
  },

  /**
   * The set a generation SURFACE saved for this conversation's run, if any
   * (dedupe target for the materialization adapter — link, don't create).
   */
  async findSurfaceSavedSetForConversation(
    conversationId: string,
  ): Promise<FcResult<FcSetRow | null>> {
    try {
      const { data, error } = await EDU()
        .from("fc_set")
        .select("*")
        .eq("metadata->>source_system", "cx_conversation")
        .eq("metadata->>source_id", conversationId)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (error) return fail("findSurfaceSavedSetForConversation", error);
      return { data: (data as FcSetRow | null) ?? null, error: null };
    } catch (e) {
      return fail("findSurfaceSavedSetForConversation", e);
    }
  },

  /**
   * THE canonical surface-save path for an agent-generated deck. Adopt the
   * adapter's set when it already exists for this run's conversation
   * (enriching it with the surface's name/topic/difficulty — the cards are
   * byte-identical, both writers persist the same envelope); otherwise create
   * the set stamped with the run's conversation identity so the adapter's
   * dedupe finds it and links instead of double-creating.
   */
  async createGeneratedSetForConversation(
    conversationId: string | null,
    input: NewSetInput,
    cards: NewCardInput[],
  ): Promise<FcResult<SetWithCards>> {
    if (conversationId) {
      const twin = await this.findChatGeneratedSetForConversation(conversationId);
      if (twin.data) {
        const updated = await this.updateSet(twin.data.id, {
          name: input.name,
          topic: input.topic ?? null,
          difficulty: input.difficulty ?? null,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        });
        if (!updated.data) return { data: null, error: updated.error };
        return this.getSetWithCards(twin.data.id);
      }
    }
    return this.createSetWithCards(
      {
        ...input,
        metadata: {
          ...(input.metadata ?? {}),
          ...(conversationId
            ? {
                source_system: "cx_conversation",
                source_id: conversationId,
                conversation_id: conversationId,
              }
            : {}),
          generation: "surface_save",
        },
      },
      cards,
    );
  },

  /**
   * "Make this deeper" — persist agent-generated sub-cards for ONE parent card.
   * Each sub-card is inserted as a normal set member (so it's studyable in the
   * deck) AND linked to its parent by an `expands_into` hierarchy edge
   * (parent → sub-card). Sub-cards append after the existing cards. Returns the
   * created rows. Edge failures are logged, not fatal (the card still lands).
   */
  async addSubCards(
    setId: string,
    parentCardId: string,
    subCards: NewCardInput[],
    opts: { orgId?: string; startPosition?: number } = {},
  ): Promise<FcResult<FcCardRow[]>> {
    const res = await this.addCards(setId, subCards, opts);
    if (res.error || !res.data) return res;
    await Promise.all(
      res.data.map(async (child) => {
        const edge = await associationsService.add({
          sourceType: "fc_card",
          sourceId: parentCardId,
          targetType: "fc_card",
          targetId: child.id,
          role: EDGE_ROLE.expandsInto,
          orgId: opts.orgId,
        });
        if (!edge.ok)
          console.error(
            "[fcService.addSubCards] expands_into edge failed:",
            edge,
          );
      }),
    );
    return res;
  },

  // ─── READ: a set with its ordered cards + details ────────────────────────
  async getSetWithCards(setId: string): Promise<FcResult<SetWithCards>> {
    try {
      const setRes = await this.getSet(setId);
      if (!setRes.data) return { data: null, error: setRes.error };

      // Membership edges (cards → this set), ordered by position. VISIBILITY-AWARE
      // read: a cross-account caller who can VIEW this set (public/link/share
      // grant) reads its card membership even without org access — the org-gated
      // `listForTargets` returned 0 edges for a stranger on a public deck, which
      // loaded an empty deck into cross-account multiplayer games (FOUND_DEFECTS
      // D37). Strict superset — same-org reads are unchanged.
      const edgesRes = await associationsService.listForTargetsVisible(
        "fc_set",
        [setId],
      );
      if (!edgesRes.ok)
        return fail("getSetWithCards", "failed to load membership edges");
      const members = edgesRes.data.edges
        .filter(
          (e) => e.sourceType === "fc_card" && e.role === EDGE_ROLE.member,
        )
        // Deterministic order: position first (null → last), then createdAt, then id —
        // so a set never silently reshuffles when positions are missing/duplicated.
        .sort(
          (a, b) =>
            (a.position ?? Number.MAX_SAFE_INTEGER) -
              (b.position ?? Number.MAX_SAFE_INTEGER) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        );
      const cardIds = members.map((e) => e.sourceId);
      const posByCard = new Map(
        members.map((e) => [e.sourceId, e.position ?? null]),
      );

      if (cardIds.length === 0)
        return { data: { set: setRes.data, cards: [] }, error: null };

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

      const byId = new Map(
        (cardRows ?? []).map((c) => [(c as FcCardRow).id, c as FcCardRow]),
      );
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

  /**
   * Load cards by an ARBITRARY id list (cross-set) with their details, RETURNED
   * IN THE CALLER'S ORDER. This is the primitive behind cross-set study surfaces
   * (adaptive "Review due", weak-areas drill) where the card order is the FSRS
   * due order from `studyService.listDue`, not a set's membership order. Missing
   * or soft-deleted ids are skipped. `position` is null (no set context).
   */
  async getCardsByIds(ids: string[]): Promise<FcResult<CardWithDetails[]>> {
    if (ids.length === 0) return { data: [], error: null };
    try {
      const { data: cardRows, error: cardErr } = await EDU()
        .from("fc_card")
        .select("*")
        .in("id", ids)
        .is("deleted_at", null);
      if (cardErr) return fail("getCardsByIds", cardErr);

      const { data: detailRows, error: detErr } = await EDU()
        .from("fc_detail")
        .select("*")
        .in("card_id", ids)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (detErr) return fail("getCardsByIds", detErr);

      const detailsByCard = new Map<string, FcDetailRow[]>();
      for (const d of (detailRows ?? []) as FcDetailRow[]) {
        const arr = detailsByCard.get(d.card_id) ?? [];
        arr.push(d);
        detailsByCard.set(d.card_id, arr);
      }

      const byId = new Map(
        (cardRows ?? []).map((c) => [(c as FcCardRow).id, c as FcCardRow]),
      );
      const cards: CardWithDetails[] = ids
        .map((id) => byId.get(id))
        .filter((c): c is FcCardRow => !!c)
        .map((c) => ({
          ...c,
          position: null,
          details: detailsByCard.get(c.id) ?? [],
        }));

      return { data: cards, error: null };
    } catch (e) {
      return fail("getCardsByIds", e);
    }
  },

  /**
   * Phase 6 (analytics) — cheap `card_id → topic` lookup, no detail join.
   * Feeds the study spine's per-topic mastery breakdown (`StudyProgress`),
   * which is item-type-agnostic and has no column of its own to join against
   * — this is the flashcards-side half of that bridge.
   */
  async getTopicsForCardIds(
    ids: string[],
  ): Promise<FcResult<Record<string, string | null>>> {
    if (ids.length === 0) return { data: {}, error: null };
    try {
      const { data, error } = await EDU()
        .from("fc_card")
        .select("id, topic")
        .in("id", ids);
      if (error) return fail("getTopicsForCardIds", error);
      const map: Record<string, string | null> = {};
      for (const row of (data ?? []) as {
        id: string;
        topic: string | null;
      }[]) {
        map[row.id] = row.topic;
      }
      return { data: map, error: null };
    } catch (e) {
      return fail("getTopicsForCardIds", e);
    }
  },

  async updateCard(
    cardId: string,
    patch: Partial<
      Pick<
        FcCardRow,
        | "front"
        | "back"
        | "card_kind"
        | "difficulty"
        | "topic"
        | "lesson"
        | "personal_notes"
        | "dynamic_content"
      >
    >,
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

  /**
   * Merge a value into ONE of a card's jsonb columns (FOUND_DEFECTS D151).
   *
   * `fc_card.metadata` and `fc_card.dynamic_content` are where a card's paid AI
   * artifacts live — the trust envelope + its verification history, generated
   * quiz items, an un-applied enhancement preview. Several surfaces write
   * DIFFERENT keys of the same object (study deck, enhance dialog, quiz), so
   * every one of those writes goes through this compare-and-swap merge rather
   * than a read-spread-write that would drop a sibling's key.
   *
   * `merge` receives the column's current object (never null) and returns the
   * whole next object — it must be pure, because it is re-run on a CAS retry.
   */
  async mergeCardJson(
    cardId: string,
    column: "metadata" | "dynamic_content",
    merge: (current: JsonObject) => JsonObject,
  ): Promise<FcResult<null>> {
    const SELECT = `id, version, ${column}`;
    const result = await mergeJsonColumn<CardJsonRow>({
      fetchCurrent: () =>
        EDU()
          .from("fc_card")
          .select(SELECT)
          .eq("id", cardId)
          .is("deleted_at", null)
          .maybeSingle<CardJsonRow>(),
      readColumn: (row) => row[column] ?? null,
      merge,
      applyUpdate: ({ value, expectedVersion, nextVersion }) =>
        EDU()
          .from("fc_card")
          .update({ [column]: value, version: nextVersion } as never)
          .eq("id", cardId)
          .eq("version", expectedVersion)
          .select(SELECT)
          .maybeSingle<CardJsonRow>(),
    });
    if (result.status === "saved") return { data: null, error: null };
    if (result.status === "error") return fail("mergeCardJson", result.error);
    return fail(
      "mergeCardJson",
      result.status === "not_found"
        ? "That card is no longer available"
        : "Another edit kept winning — the card was not updated",
    );
  },

  /** Soft-delete a card. The `member` edge is left in place (harmless — the
   * card row is filtered by `deleted_at` everywhere it's read), avoiding a
   * second round-trip for something with no user-visible effect. */
  async deleteCard(cardId: string): Promise<FcResult<null>> {
    try {
      const { error } = await EDU()
        .from("fc_card")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", cardId);
      if (error) return fail("deleteCard", error);
      return { data: null, error: null };
    } catch (e) {
      return fail("deleteCard", e);
    }
  },

  /**
   * Rewrite the `member` edges' `position` to match `orderedCardIds` exactly
   * (index = new position). Each write is an idempotent upsert
   * (`assoc_add` ON CONFLICT), so a partial failure just leaves some cards at
   * their old position rather than corrupting the set.
   */
  async reorderCards(
    setId: string,
    orderedCardIds: string[],
  ): Promise<FcResult<null>> {
    try {
      const results = await Promise.all(
        orderedCardIds.map((cardId, position) =>
          associationsService.add({
            sourceType: "fc_card",
            sourceId: cardId,
            targetType: "fc_set",
            targetId: setId,
            role: EDGE_ROLE.member,
            position,
          }),
        ),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) return fail("reorderCards", failed.error);
      return { data: null, error: null };
    } catch (e) {
      return fail("reorderCards", e);
    }
  },

  // ─── DETAILS (helper / example / spoken / ...) ───────────────────────────
  async addDetail(
    cardId: string,
    kind: string,
    text: string,
    opts: {
      audio_file_id?: string;
      image_file_id?: string;
      image_url?: string;
      generated_by?: "agent" | "user";
      position?: number;
      /**
       * Provenance / structure the layer's text alone can't carry — e.g. the
       * per-card memory-aid lane stamps `{source:'memory_hint', technique,
       * explanation}` so the aid can be read back as its own payload (D151).
       */
      metadata?: JsonObject;
    } = {},
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
        image_file_id: opts.image_file_id ?? null,
        image_url: opts.image_url ?? null,
        generated_by: opts.generated_by ?? "agent",
        position: opts.position ?? 0,
        generation_status: opts.audio_file_id
          ? "audio_ready"
          : opts.image_file_id || opts.image_url
            ? "image_ready"
            : "text_ready",
        ...(opts.metadata ? { metadata: opts.metadata } : {}),
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

  /** Soft-delete one detail row (all reads filter `deleted_at is null`). */
  async softDeleteDetail(detailId: string): Promise<FcResult<null>> {
    try {
      const { error } = await EDU()
        .from("fc_detail")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", detailId);
      if (error) return fail("softDeleteDetail", error);
      return { data: null, error: null };
    } catch (e) {
      return fail("softDeleteDetail", e);
    }
  },

  /**
   * THE face-image writer — one active `front_image`/`back_image` row per
   * face. Soft-deletes any prior rows of the kind, then inserts the new one.
   * Exactly one of `file_id` / `url` should be set (stored vs hotlinked web
   * image); `alt` lands in `text` (accessibility is not optional here).
   * Cross-repo contract: common-docs/systems/flashcard-images/VISION_AND_PLAN.md.
   */
  async setCardImage(
    cardId: string,
    face: "front" | "back",
    image: {
      file_id?: string;
      url?: string;
      alt: string;
      generated_by?: "agent" | "user";
      metadata?: JsonObject;
    },
  ): Promise<FcResult<FcDetailRow>> {
    const kind = `${face}_image`;
    if (!image.file_id && !image.url) {
      return fail("setCardImage", "setCardImage needs a file_id or a url");
    }
    try {
      const { error: supersedeErr } = await EDU()
        .from("fc_detail")
        .update({ deleted_at: new Date().toISOString() })
        .eq("card_id", cardId)
        .eq("kind", kind)
        .is("deleted_at", null);
      if (supersedeErr) return fail("setCardImage", supersedeErr);
      return await this.addDetail(cardId, kind, image.alt, {
        image_file_id: image.file_id,
        image_url: image.url,
        generated_by: image.generated_by ?? "user",
        metadata: image.metadata,
      });
    } catch (e) {
      return fail("setCardImage", e);
    }
  },

  /**
   * Record the HUMAN's verdict on an agent-attached face image, then (on a
   * rejection) soft-delete it. The verdict is stamped on the detail row BEFORE
   * the soft-delete so the row survives as evidence: judge accuracy for
   * `education.card_image_web_source` / `card_image_qc_judge` is only learnable
   * if every "the agent was wrong here" click is written down somewhere the
   * verdict ledger can later be reconciled against (VISION_AND_PLAN §2.4).
   * A silent delete throws that signal away.
   */
  async reviewCardImage(
    cardId: string,
    face: "front" | "back",
    verdict: "accepted" | "rejected",
    opts: { reason?: string; surface?: string } = {},
  ): Promise<FcResult<null>> {
    const kind = `${face}_image`;
    try {
      const { data: rows, error: readErr } = await EDU()
        .from("fc_detail")
        .select("id, metadata")
        .eq("card_id", cardId)
        .eq("kind", kind)
        .is("deleted_at", null);
      if (readErr) return fail("reviewCardImage", readErr);

      const reviewedAt = new Date().toISOString();
      for (const row of rows ?? []) {
        const prior =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as JsonObject)
            : {};
        const { error: writeErr } = await EDU()
          .from("fc_detail")
          .update({
            metadata: {
              ...prior,
              human_review: {
                verdict,
                reviewed_at: reviewedAt,
                surface: opts.surface ?? "set_illustrate_review",
                ...(opts.reason ? { reason: opts.reason } : {}),
              },
            } as JsonObject,
          })
          .eq("id", row.id);
        if (writeErr) return fail("reviewCardImage", writeErr);
      }

      if (verdict === "rejected") return await this.removeCardImage(cardId, face);
      return { data: null, error: null };
    } catch (e) {
      return fail("reviewCardImage", e);
    }
  },

  /** Remove a face's image (soft-deletes every active row of the kind). */
  async removeCardImage(
    cardId: string,
    face: "front" | "back",
  ): Promise<FcResult<null>> {
    try {
      const { error } = await EDU()
        .from("fc_detail")
        .update({ deleted_at: new Date().toISOString() })
        .eq("card_id", cardId)
        .eq("kind", `${face}_image`)
        .is("deleted_at", null);
      if (error) return fail("removeCardImage", error);
      return { data: null, error: null };
    } catch (e) {
      return fail("removeCardImage", e);
    }
  },

  /**
   * VISION/WP3 gap 5 — MERGE two or more cards into one (Arman asked for it by
   * name). The caller composes the merged face text (the dialog previews and
   * lets the learner edit it), so this method is the WRITE half only:
   *
   *   1. the primary card takes the merged front/back,
   *   2. the losers' details are re-pointed at the primary,
   *   3. the losers are soft-deleted.
   *
   * `spoken_front` details are deliberately NOT carried over: that audio is TTS
   * of a front that just changed, and the table holds one spoken front per card
   * (`fc_detail_one_spoken_front_per_card`). It regenerates on demand.
   *
   * Not transactional — the steps are ordered so a partial failure is always
   * recoverable and never destructive: content lands first, the delete is last,
   * so a mid-way failure leaves duplicate cards (visible, re-mergeable) rather
   * than lost content.
   */
  async mergeCards(input: {
    primaryCardId: string;
    front: string;
    back: string;
    mergedCardIds: string[];
  }): Promise<FcResult<FcCardRow>> {
    const { primaryCardId, front, back, mergedCardIds } = input;
    const losers = mergedCardIds.filter((id) => id !== primaryCardId);
    if (losers.length === 0) {
      return fail("mergeCards", "Pick at least two cards to merge");
    }
    try {
      const updated = await this.updateCard(primaryCardId, { front, back });
      if (updated.error) return fail("mergeCards", updated.error);

      // Carry the losers' details onto the survivor (audio helpers, examples,
      // images, trust rows) — everything the learner already paid for.
      const { error: detailErr } = await EDU()
        .from("fc_detail")
        .update({ card_id: primaryCardId })
        .in("card_id", losers)
        .is("deleted_at", null)
        .neq("kind", "spoken_front");
      if (detailErr) return fail("mergeCards", detailErr);

      const { error: delErr } = await EDU()
        .from("fc_card")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", losers);
      if (delErr) return fail("mergeCards", delErr);

      return { data: updated.data, error: null };
    } catch (e) {
      return fail("mergeCards", e);
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
