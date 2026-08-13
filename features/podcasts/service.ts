"use client";

import { supabase } from "@/utils/supabase/client";
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
