"use client";

// features/podcasts/generator/useEpisodeArticles.ts
//
// Generate + persist per-episode companion content (blog post / show notes).
// Each kind maps to a built system agent run via the one-shot `useRunAgent`
// primitive; the streamed markdown is held in `drafts` (live preview) and
// saved to pc_articles via `articleService`. Regenerating replaces the row
// (unique (episode_id, kind)).

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import { articleService } from "@/features/podcasts/articleService";
import { assembleArticle } from "@/features/podcasts/generator/articleMarkdown";
import { slugify } from "@/features/podcasts/utils";
import type {
  PcArticle,
  PcArticleKind,
  PcEpisodeWithShow,
} from "@/features/podcasts/types";

// Built agents (internal_agents/_generated). See the agent specs for variables.
const BLOG_WRITER_AGENT_ID = "58204bd9-bc32-4f5a-854d-13d859ff833c";
const SHOW_NOTES_AGENT_ID = "b1910198-a8af-4c8c-8d66-afe135e22f97";

/** Build the episode_metadata JSON the agents consume from the episode + show. */
function episodeMetadata(episode: PcEpisodeWithShow): Record<string, unknown> {
  const hostNames = (episode.speakers ?? []).map((s) => s.name);
  return {
    show_name: episode.show?.title ?? "",
    show_description: episode.show?.description ?? "",
    show_url: episode.show?.slug ? `/podcast/${episode.show.slug}` : "",
    host_names: hostNames,
    episode_title: episode.title,
    episode_description: episode.description ?? "",
    episode_number: episode.episode_number ?? null,
    guest_names: [],
    episode_url: episode.slug ? `/podcast/${episode.slug}` : "",
    referenced_links: [],
    keywords: [],
    related_episodes: [],
  };
}

export interface UseEpisodeArticles {
  /** Persisted articles keyed by kind (loaded + after save). */
  articles: Partial<Record<PcArticleKind, PcArticle>>;
  /** Assembled markdown preview shown right after generation, before reload
   *  (cleared once the saved article is in `articles`). */
  drafts: Partial<Record<PcArticleKind, string>>;
  busy: Partial<Record<PcArticleKind, boolean>>;
  loading: boolean;
  /** Run the agent for a kind, stream the draft, and save it (status: draft). */
  generate: (kind: PcArticleKind) => Promise<void>;
  /** Flip an article between draft and published. */
  togglePublish: (kind: PcArticleKind) => Promise<void>;
}

export function useEpisodeArticles(
  episode: PcEpisodeWithShow | null,
): UseEpisodeArticles {
  const { run } = useRunAgent();
  const [articles, setArticles] = useState<
    Partial<Record<PcArticleKind, PcArticle>>
  >({});
  const [drafts, setDrafts] = useState<Partial<Record<PcArticleKind, string>>>(
    {},
  );
  const [busy, setBusy] = useState<Partial<Record<PcArticleKind, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const episodeId = episode?.id ?? null;
  const articleRef = useRef(articles);
  articleRef.current = articles;

  useEffect(() => {
    let cancelled = false;
    if (!episodeId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    void articleService
      .fetchByEpisode(episodeId)
      .then((rows) => {
        if (cancelled) return;
        const byKind: Partial<Record<PcArticleKind, PcArticle>> = {};
        for (const r of rows) byKind[r.kind] = r;
        setArticles(byKind);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  const generate = useCallback(
    async (kind: PcArticleKind) => {
      if (!episode || !episode.script?.trim()) {
        toast.error("This episode has no script to write from.");
        return;
      }
      setBusy((b) => ({ ...b, [kind]: true }));
      setDrafts((d) => ({ ...d, [kind]: undefined }));
      try {
        const metadataJson = JSON.stringify(episodeMetadata(episode));
        const variables =
          kind === "blog"
            ? {
                episode_transcript: episode.script,
                episode_metadata: metadataJson,
                style_guidance: "",
              }
            : {
                episode_transcript: episode.script,
                episode_metadata_json: metadataJson,
                duration_hint: episode.duration_seconds
                  ? String(episode.duration_seconds)
                  : "",
              };
        // The agents emit a structured JSON envelope (behind a <reasoning>
        // preamble), NOT raw markdown — streaming it raw would show JSON, so we
        // assemble renderable markdown from the parsed object on completion.
        const agentText = await run({
          agentId: kind === "blog" ? BLOG_WRITER_AGENT_ID : SHOW_NOTES_AGENT_ID,
          variables,
        });
        const fallbackTitle = `${episode.title} — ${kind === "blog" ? "Blog" : "Show notes"}`;
        const { title, markdown, slugSuggestion } = assembleArticle(
          kind,
          agentText,
          fallbackTitle,
        );
        setDrafts((d) => ({ ...d, [kind]: markdown }));
        const saved = await articleService.upsert({
          episode_id: episode.id,
          show_id: episode.show_id,
          kind,
          // Blog gets a public, globally-unique slug (the suffix guards the DB
          // unique constraint); show notes render inline (no slug).
          slug:
            kind === "blog"
              ? `${slugify(slugSuggestion || title) || "episode"}-${episode.id.slice(0, 8)}`
              : null,
          title,
          content_markdown: markdown,
          og_image_url: episode.image_url,
          status: "draft",
        });
        setArticles((a) => ({ ...a, [kind]: saved }));
        setDrafts((d) => ({ ...d, [kind]: undefined }));
        toast.success(kind === "blog" ? "Blog post ready." : "Show notes ready.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Generation failed.");
      } finally {
        setBusy((b) => ({ ...b, [kind]: false }));
      }
    },
    [episode, run],
  );

  const togglePublish = useCallback(
    async (kind: PcArticleKind) => {
      const article = articleRef.current[kind];
      if (!article) return;
      const next = article.status === "published" ? "draft" : "published";
      try {
        const updated = await articleService.setStatus(article.id, next);
        setArticles((a) => ({ ...a, [kind]: updated }));
        toast.success(next === "published" ? "Published." : "Unpublished.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update.");
      }
    },
    [],
  );

  return { articles, drafts, busy, loading, generate, togglePublish };
}
