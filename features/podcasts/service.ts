"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  PcShow,
  PcEpisode,
  PcEpisodeWithShow,
  PcSlugLookupResult,
} from "./types";

export const podcastService = {
  // ── Shows ──────────────────────────────────────────────────────────────

  async fetchAllShows(): Promise<PcShow[]> {
    const { data, error } = await supabase
      .from("pc_shows")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as PcShow[];
  },

  async createShow(
    payload: Omit<PcShow, "id" | "created_at" | "updated_at">,
  ): Promise<PcShow> {
    const { data, error } = await supabase
      .from("pc_shows")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as PcShow;
  },

  async updateShow(
    id: string,
    payload: Partial<Omit<PcShow, "id" | "created_at" | "updated_at">>,
  ): Promise<PcShow> {
    const { data, error } = await supabase
      .from("pc_shows")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as PcShow;
  },

  async removeShow(id: string): Promise<void> {
    const { error } = await supabase.from("pc_shows").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Episodes ───────────────────────────────────────────────────────────

  async fetchAllEpisodes(): Promise<PcEpisodeWithShow[]> {
    const { data, error } = await supabase
      .from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as PcEpisodeWithShow[];
  },

  async fetchEpisodesByShow(showId: string): Promise<PcEpisode[]> {
    const { data, error } = await supabase
      .from("pc_episodes")
      .select("*")
      .eq("show_id", showId)
      .order("episode_number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data as PcEpisode[];
  },

  async fetchEpisodesForShow(showId: string): Promise<PcEpisodeWithShow[]> {
    const { data, error } = await supabase
      .from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .eq("show_id", showId)
      .order("episode_number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data as PcEpisodeWithShow[];
  },

  async fetchEpisodesByUser(userId: string): Promise<PcEpisodeWithShow[]> {
    const { data, error } = await supabase
      .from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as PcEpisodeWithShow[];
  },

  async fetchShowById(id: string): Promise<PcShow | null> {
    const { data, error } = await supabase
      .from("pc_shows")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return data as PcShow;
  },

  async fetchEpisodeById(id: string): Promise<PcEpisodeWithShow | null> {
    const { data, error } = await supabase
      .from("pc_episodes")
      .select("*, show:pc_shows(id, slug, title, image_url)")
      .eq("id", id)
      .single();
    if (error) return null;
    return data as PcEpisodeWithShow;
  },

  async createEpisode(
    payload: Omit<PcEpisode, "id" | "created_at" | "updated_at" | "user_id"> & {
      user_id?: string | null;
    },
  ): Promise<PcEpisode> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("pc_episodes")
      .insert({
        ...payload,
        user_id: payload.user_id ?? user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as PcEpisode;
  },

  async updateEpisode(
    id: string,
    payload: Partial<Omit<PcEpisode, "id" | "created_at" | "updated_at">>,
  ): Promise<PcEpisode> {
    const { data, error } = await supabase
      .from("pc_episodes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as PcEpisode;
  },

  async removeEpisode(id: string): Promise<void> {
    const { error } = await supabase.from("pc_episodes").delete().eq("id", id);
    if (error) throw error;
  },

  // ── Slug resolver (used by public route) ───────────────────────────────

  async lookupBySlug(slug: string): Promise<PcSlugLookupResult> {
    // Check episodes first (most common case for sharing)
    const { data: episode } = await supabase
      .from("pc_episodes")
      .select(
        "*, show:pc_shows(id, slug, title, description, image_url, author, is_published, created_at, updated_at)",
      )
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .single();

    if (episode) {
      return { type: "episode", data: episode as PcEpisodeWithShow };
    }

    // Fall back to shows
    const { data: show } = await supabase
      .from("pc_shows")
      .select("*")
      .or(`slug.eq.${slug},id.eq.${slug}`)
      .single();

    if (show) {
      return { type: "show", data: show as PcShow };
    }

    return null;
  },
};
