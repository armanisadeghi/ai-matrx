"use client";

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { asJsonObject, mergeJsonColumn } from "@/lib/supabase/mergeJsonColumn";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  PcShow,
  PcEpisode,
  PcEpisodeChapter,
  PcEpisodeWithShow,
  PcSlugLookupResult,
} from "./types";
import {
  mapPcEpisodeRow,
  mapPcEpisodeWithShowRow,
  mapPcShowRow,
} from "./types";

/** The `pc_shows.metadata` key holding the show's generated topic-idea bank. */
export const TOPIC_IDEA_BANK_KEY = "topic_ideas";
/** How many past batches a show keeps. */
const TOPIC_IDEA_BANK_CAP = 20;

/** One banked batch, exactly as the generator produced it. */
export interface TopicIdeaBatch {
  batch: Json;
  generated_at: string;
}

/** The narrow row shape the idea-bank merge reads and writes. */
interface PcShowMetadataRow {
  id: string;
  version: number;
  metadata: Json;
}

export const podcastService = {
  // ── Shows ──────────────────────────────────────────────────────────────

  async fetchAllShows(): Promise<PcShow[]> {
    const userId = requireUserId();
    const { data, error } = await supabase
      .schema("podcast").from("pc_shows")
      .select("*")
      .is("deleted_at", null)
      .eq("created_by", userId) // VIEW LAW: mine-scoped
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPcShowRow);
  },

  async createShow(
    // rss_settings is nullable + defaultable in the DB, so callers may omit it.
    // created_by is stamped by the DB's `_stamp_actor` trigger — never client-set.
    payload: Omit<
      PcShow,
      "id" | "created_at" | "updated_at" | "created_by" | "rss_settings"
    > & {
      rss_settings?: PcShow["rss_settings"];
    },
  ): Promise<PcShow> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_shows")
      .insert({ ...payload, organization_id: await ensureOrgId(undefined) })
      .select()
      .single();
    if (error) throw error;
    return mapPcShowRow(data);
  },

  async updateShow(
    id: string,
    payload: Partial<
      Omit<PcShow, "id" | "created_at" | "updated_at" | "created_by">
    >,
  ): Promise<PcShow> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_shows")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return mapPcShowRow(data);
  },

  /**
   * Bank a generated batch of topic ideas on the show (FOUND_DEFECTS D151).
   *
   * The idea generator writes five ideas and the studio kept one; the other
   * four were paid model output that vanished when the dialog closed. They now
   * accumulate on `pc_shows.metadata.topic_ideas` as the show's idea bank,
   * newest batch first, merged compare-and-swap so two studio tabs can't clobber
   * each other.
   *
   * Background persistence — it reports failures loudly but never throws into
   * the surface that triggered it.
   */
  async bankTopicIdeas(showId: string, batch: unknown): Promise<void> {
    const SELECT = "id, version, metadata";
    const result = await mergeJsonColumn<PcShowMetadataRow>({
      fetchCurrent: () =>
        supabase
          .schema("podcast")
          .from("pc_shows")
          .select(SELECT)
          .eq("id", showId)
          .is("deleted_at", null)
          .maybeSingle<PcShowMetadataRow>(),
      readColumn: (row) => row.metadata,
      merge: (current) => {
        const prior = Array.isArray(current[TOPIC_IDEA_BANK_KEY])
          ? (current[TOPIC_IDEA_BANK_KEY] as Json[])
          : [];
        return {
          ...current,
          [TOPIC_IDEA_BANK_KEY]: [
            { batch: batch as Json, generated_at: new Date().toISOString() },
            ...prior,
          ].slice(0, TOPIC_IDEA_BANK_CAP),
        };
      },
      applyUpdate: ({ value, expectedVersion, nextVersion }) =>
        supabase
          .schema("podcast")
          .from("pc_shows")
          .update({ metadata: value as never, version: nextVersion } as never)
          .eq("id", showId)
          .eq("version", expectedVersion)
          .select(SELECT)
          .maybeSingle<PcShowMetadataRow>(),
    });
    if (result.status !== "saved") {
      console.error(
        "[podcastService] topic ideas generated but NOT banked:",
        result.status === "error" ? result.error : result.status,
      );
    }
  },

  /** Every banked topic-idea batch for a show, newest first. */
  readTopicIdeaBank(show: { metadata?: Json | null }): TopicIdeaBatch[] {
    const rows = asJsonObject(show.metadata ?? null)[TOPIC_IDEA_BANK_KEY];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (r): r is Record<string, Json> =>
          !!r && typeof r === "object" && !Array.isArray(r),
      )
      .map((r) => ({
        batch: r.batch ?? null,
        generated_at: typeof r.generated_at === "string" ? r.generated_at : "",
      }));
  },

  async removeShow(id: string): Promise<void> {
    const { error } = await supabase.schema("podcast").from("pc_shows").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Episodes ───────────────────────────────────────────────────────────

  async fetchAllEpisodes(): Promise<PcEpisodeWithShow[]> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapPcEpisodeWithShowRow(row));
  },

  async fetchEpisodesByShow(showId: string): Promise<PcEpisode[]> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .select("*")
      .is("deleted_at", null)
      .eq("show_id", showId)
      .order("episode_number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(mapPcEpisodeRow);
  },

  async fetchEpisodesForShow(showId: string): Promise<PcEpisodeWithShow[]> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .is("deleted_at", null)
      .eq("show_id", showId)
      .order("episode_number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapPcEpisodeWithShowRow(row));
  },

  async fetchEpisodesByUser(userId: string): Promise<PcEpisodeWithShow[]> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .is("deleted_at", null)
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapPcEpisodeWithShowRow(row));
  },

  async fetchShowById(id: string): Promise<PcShow | null> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_shows")
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .single();
    if (error) return null;
    return mapPcShowRow(data);
  },

  async fetchEpisodeById(id: string): Promise<PcEpisodeWithShow | null> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .is("deleted_at", null)
      .eq("id", id)
      .single();
    if (error) return null;
    return mapPcEpisodeWithShowRow(data);
  },

  async createEpisode(
    payload: Omit<
      PcEpisode,
      "id" | "created_at" | "updated_at" | "created_by" | "chapters"
    > & {
      created_by?: string | null;
    },
  ): Promise<PcEpisode> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .insert({
        ...payload,
        created_by: payload.created_by ?? user?.id ?? null,
        organization_id: await ensureOrgId(undefined),
      })
      .select()
      .single();
    if (error) throw error;
    return mapPcEpisodeRow(data);
  },

  async updateEpisode(
    id: string,
    payload: Partial<
      Omit<PcEpisode, "id" | "created_at" | "updated_at" | "chapters">
    >,
  ): Promise<PcEpisode> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return mapPcEpisodeRow(data);
  },

  /** Persist auto-generated chapter markers under metadata.chapters (not a
   *  column — read-merge-write so unrelated metadata keys survive). */
  async saveEpisodeChapters(
    id: string,
    chapters: PcEpisodeChapter[],
  ): Promise<PcEpisode> {
    const { data: current, error: readError } = await supabase
      .schema("podcast").from("pc_episodes")
      .select("metadata")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    const base =
      current?.metadata &&
      typeof current.metadata === "object" &&
      !Array.isArray(current.metadata)
        ? current.metadata
        : {};
    const { data, error } = await supabase
      .schema("podcast").from("pc_episodes")
      .update({ metadata: { ...base, chapters } })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return mapPcEpisodeRow(data);
  },

  async removeEpisode(id: string): Promise<void> {
    const { error } = await supabase.schema("podcast").from("pc_episodes").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Slug resolver (used by public route) ───────────────────────────────

  async lookupBySlug(slug: string): Promise<PcSlugLookupResult> {
    // Check episodes first (most common case for sharing)
    const { data: episode } = await supabase
      .schema("podcast").from("pc_episodes")
      .select(
        "*, show:pc_shows(id, slug, title, description, image_url, author, is_published, created_at, updated_at)",
      )
      .is("deleted_at", null)
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .single();

    if (episode) {
      return { type: "episode", data: mapPcEpisodeWithShowRow(episode) };
    }

    // Fall back to shows
    const { data: show } = await supabase
      .schema("podcast").from("pc_shows")
      .select("*")
      .is("deleted_at", null)
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .single();

    if (show) {
      return { type: "show", data: mapPcShowRow(show) };
    }

    return null;
  },
};
