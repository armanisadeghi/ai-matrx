"use client";

// features/podcasts/generator/useEpisodeTitleOptions.ts
//
// Suggest + apply optimized titles for a FINISHED episode. The
// podcast.title_optimizer agent (DB-managed mandate — rebind from
// /administration/agents/mandates) reads the episode's real script plus the same
// episode_metadata JSON the blog/show-notes agents consume, and emits the
// canonical `episode_title_options` render block. Deliberately post-episode
// only (Arman's ruling): the agent always sees the FINAL script, so a chosen
// title can never drift from the content. Applying an option updates
// pc_episodes.title (the slug — and so the public URL — is intentionally
// untouched); every later agent that reads the episode row (blog, show notes,
// metadata JSON) picks the new title up automatically.
//
// LIVE POSTURE (2026-08-11). This ran through `useRunAgent`, which produces no
// requestId at all, so the user watched a spinner while the model wrote —
// THE FLOATING LAW's exact violation. It now runs through `useLiveAgentRun`
// and streams into the floating `LiveRunWindow`, where the registered kind
// renders the option cards token-by-token. The window is floating rather than
// inline because this panel sits mid-page: an inline block would shove the
// episode's own content down the instant the run starts.
//
// The window is not decoration — it is the PRIMARY surface. Each streamed card
// carries its own "Use this title" button, which applies through the
// `episode_title` surface write target (the same
// podcastService.updateEpisode call `apply()` below makes). `apply()` remains
// for the panel's own list and for any caller that already has a title string.

import { useCallback, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  useOpenLiveRunWindow,
  type LiveRunWindowHandle,
} from "@/features/overlays/openers/liveRunWindow";
import { podcastService } from "@/features/podcasts/service";
import { episodeMetadata } from "@/features/podcasts/generator/useEpisodeArticles";
import {
  readEpisodeTitleOptionsValue,
  type EpisodeTitleOptionValue,
} from "@/features/content-ir/kinds/episode-title-options";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

const TITLE_OPTIMIZER_MANDATE_KEY = "podcast.title_optimizer";

/** One ranked option, in the kind bridge's shape (nullable subtitle/rationale
 *  — never coerced to `""`). Parsed by the ONE canonical reader,
 *  `readEpisodeTitleOptionsValue` (features/content-ir/kinds/
 *  episode-title-options.ts), the same one the streaming envelope bridge uses,
 *  so the live window and this settled list can never disagree. */
export type EpisodeTitleOption = EpisodeTitleOptionValue;

export interface UseEpisodeTitleOptions {
  /** Ranked options from the last generation (this session, this episode). */
  options: EpisodeTitleOption[];
  /** The current title the agent echoed back (`working_title`), if any. */
  workingTitle: string | null;
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
  const { run, isRunning, error: runError } = useLiveAgentRun();
  const openLiveRunWindow = useOpenLiveRunWindow();
  // One window per episode: re-running replaces the run inside the same
  // window instead of stacking a second one.
  const windowRef = useRef<LiveRunWindowHandle | null>(null);
  // Keyed by episode so a stale result can never leak across episodes.
  const [generated, setGenerated] = useState<{
    episodeId: string;
    workingTitle: string | null;
    options: EpisodeTitleOption[];
  } | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<{
    episodeId: string;
    title: string;
  } | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options =
    generated && generated.episodeId === episode?.id ? generated.options : [];
  const workingTitle =
    generated && generated.episodeId === episode?.id
      ? generated.workingTitle
      : null;
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
    setError(null);
    // Float FIRST, before the launch: the window is what the user watches
    // while the run connects, so opening it after the stream would be a
    // spinner by another name.
    const handle = openLiveRunWindow({
      instanceId: `episode-title-options:${episode.id}`,
      label: "Writing title options",
      pending: true,
    });
    windowRef.current = handle;
    try {
      const result = await run<unknown>({
        mandateKey: TITLE_OPTIMIZER_MANDATE_KEY,
        surfaceKey: "podcast-run:title-options",
        sourceFeature: "podcasts",
        surfaceName: "matrx-user/podcast-run",
        variables: {
          working_title: episode.title,
          content_summary: episode.script,
          show_metadata_json: JSON.stringify(episodeMetadata(episode)),
          keywords: "",
        },
        // The live handle lands mid-stream; feeding it to the already-open
        // window is what turns "pending" into streamed cards.
        onConversationCreated: (conversationId) => {
          handle.update({ conversationId, pending: false });
        },
      });
      const parsed = readEpisodeTitleOptionsValue(result);
      if (!parsed.options.length) {
        throw new Error("The title agent returned no usable options.");
      }
      setGenerated({
        episodeId: episode.id,
        workingTitle: parsed.working_title,
        options: parsed.options,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Title generation failed.";
      setError(message);
      toast.error(message);
    }
  }, [episode, openLiveRunWindow, run]);

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

  return {
    options,
    workingTitle,
    currentTitle,
    busy: isRunning,
    applying,
    error: error ?? runError,
    generate,
    apply,
  };
}
