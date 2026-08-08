"use client";

// features/podcasts/generator/useEpisodeTitleOptions.ts
//
// Suggest + apply optimized titles for a FINISHED episode. The
// podcast.title_optimizer agent (DB-managed slot — repin from
// /administration/agents/slots) reads the episode's real script plus the same
// episode_metadata JSON the blog/show-notes agents consume, and returns ranked
// title options. Deliberately post-episode only (Arman's ruling): the agent
// always sees the FINAL script, so a chosen title can never drift from the
// content. Applying an option updates pc_episodes.title (the slug — and so the
// public URL — is intentionally untouched); every later agent that reads the
// episode row (blog, show notes, metadata JSON) picks the new title up
// automatically. Sibling of useEpisodeChapters — same resolveAgentSlot +
// useRunAgent one-shot pattern.

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import { resolveAgentSlot } from "@/features/agents/slots/service";
import { extractFirstObject } from "@/utils/json/extract-json";
import { podcastService } from "@/features/podcasts/service";
import { episodeMetadata } from "@/features/podcasts/generator/useEpisodeArticles";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

const TITLE_OPTIMIZER_SLOT_KEY = "podcast.title_optimizer";

export interface EpisodeTitleOption {
  title: string;
  subtitle: string;
  rationale: string;
}

function parseTitleOptions(value: unknown): EpisodeTitleOption[] {
  if (!value || typeof value !== "object") return [];
  const options = (value as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  const out: EpisodeTitleOption[] = [];
  for (const raw of options) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    out.push({
      title,
      subtitle: typeof o.subtitle === "string" ? o.subtitle.trim() : "",
      rationale: typeof o.rationale === "string" ? o.rationale.trim() : "",
    });
  }
  return out;
}

export interface UseEpisodeTitleOptions {
  /** Ranked options from the last generation (this session, this episode). */
  options: EpisodeTitleOption[];
  /** The episode's current title after any apply. */
  currentTitle: string | null;
  busy: boolean;
  applying: string | null;
  error: string | null;
  /** Run the title optimizer against the finished episode. */
  generate: () => Promise<void>;
  /** Persist a chosen title onto pc_episodes.title. */
  apply: (title: string) => Promise<void>;
}

export function useEpisodeTitleOptions(
  episode: PcEpisodeWithShow | null,
): UseEpisodeTitleOptions {
  const { run } = useRunAgent();
  // Keyed by episode so a stale result can never leak across episodes.
  const [generated, setGenerated] = useState<{
    episodeId: string;
    options: EpisodeTitleOption[];
  } | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<{
    episodeId: string;
    title: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options =
    generated && generated.episodeId === episode?.id ? generated.options : [];
  const currentTitle =
    appliedTitle && appliedTitle.episodeId === episode?.id
      ? appliedTitle.title
      : (episode?.title ?? null);

  const generate = useCallback(async () => {
    if (!episode) return;
    if (!episode.script?.trim()) {
      toast.error("This episode has no script to optimize a title from.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const slot = await resolveAgentSlot(TITLE_OPTIMIZER_SLOT_KEY);
      const agentText = await run({
        agentId: slot.agentId,
        variables: {
          working_title: episode.title,
          content_summary: episode.script,
          show_metadata_json: JSON.stringify(episodeMetadata(episode)),
          keywords: "",
        },
        configOverrides: slot.configOverrides ?? undefined,
        sourceApp: "matrx-frontend",
        sourceFeature: "podcasts",
      });
      const parsed = extractFirstObject(agentText);
      const list = parseTitleOptions(parsed?.value ?? null);
      if (!list.length) {
        throw new Error("The title agent returned no usable options.");
      }
      setGenerated({ episodeId: episode.id, options: list });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Title generation failed.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [episode, run]);

  const apply = useCallback(
    async (title: string) => {
      if (!episode || !title.trim()) return;
      setApplying(title);
      try {
        await podcastService.updateEpisode(episode.id, { title: title.trim() });
        setAppliedTitle({ episodeId: episode.id, title: title.trim() });
        toast.success(
          "Title updated. Blog & show notes generated earlier keep the old title — regenerate them to match.",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Couldn't update the title.";
        toast.error(message);
      } finally {
        setApplying(null);
      }
    },
    [episode],
  );

  return { options, currentTitle, busy, applying, error, generate, apply };
}
