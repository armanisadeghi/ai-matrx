"use client";

// features/podcasts/articleService.ts
//
// Direct-Supabase CRUD for pc_articles — the per-episode companion content
// (blog post / show notes). Mirrors the podcastService shape: no Next.js API
// tier, one row per (episode_id, kind), upsert-on-regenerate.

import { supabase } from "@/utils/supabase/client";
import type { PcArticle, PcArticleKind } from "./types";

export const articleService = {
  /** Every article for an episode (blog + show_notes), newest first. */
  async fetchByEpisode(episodeId: string): Promise<PcArticle[]> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_articles")
      .select("*")
      .eq("episode_id", episodeId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data as PcArticle[];
  },

  /** The single article of a given kind for an episode, or null. */
  async fetchOne(
    episodeId: string,
    kind: PcArticleKind,
  ): Promise<PcArticle | null> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_articles")
      .select("*")
      .eq("episode_id", episodeId)
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw error;
    return (data as PcArticle) ?? null;
  },

  /** Public read by slug (anonymous blog/show-notes page). */
  async fetchPublishedBySlug(slug: string): Promise<PcArticle | null> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_articles")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) return null;
    return (data as PcArticle) ?? null;
  },

  /** Create or replace the article of a kind for an episode (regenerate-safe
   *  via the unique (episode_id, kind) constraint). */
  async upsert(
    payload: Pick<PcArticle, "episode_id" | "kind"> &
      Partial<
        Pick<
          PcArticle,
          | "show_id"
          | "user_id"
          | "slug"
          | "title"
          | "content_markdown"
          | "og_image_url"
          | "canonical_url"
          | "status"
        >
      >,
  ): Promise<PcArticle> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .schema("podcast").from("pc_articles")
      .upsert(
        { ...payload, user_id: payload.user_id ?? user?.id ?? null },
        { onConflict: "episode_id,kind" },
      )
      .select()
      .single();
    if (error) throw error;
    return data as PcArticle;
  },

  async setStatus(
    id: string,
    status: PcArticle["status"],
  ): Promise<PcArticle> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_articles")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as PcArticle;
  },

  async updateContent(
    id: string,
    content_markdown: string,
  ): Promise<PcArticle> {
    const { data, error } = await supabase
      .schema("podcast").from("pc_articles")
      .update({ content_markdown })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as PcArticle;
  },
};
