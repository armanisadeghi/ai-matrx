"use client";

// features/podcasts/generator/useSourceResolvers.ts
//
// Resolves each non-text podcast source into editable plain text that the form
// then sends as `input_data`. One hook per fetch primitive, all reusing
// existing platform capabilities — nothing here is podcast-specific plumbing:
//
//   website    → useScraperApi.scrapeUrl  +  Web Content Extractor agent
//   youtube    → YouTube Transcription & Research agent (URL in, transcript out)
//   audio_file → useFileUpload (durable upload)  +  useAudioTranscription (STT)
//
// The Notes source is resolved inline in the form (it just reads the picked
// note's content from Redux via useNotes — no async fetch needed).
//
// Each resolver streams progress via `onProgress(text)` and returns the final
// text. Callers own the editable textarea + the eventual generate call.
//
// The two agent-backed resolvers run through `useLiveAgentRun` on their
// MANDATE KEYS (2026-08-23) — never resolve-then-`agentId`, which dropped the
// binding's `config_overrides` and produced no live requestId (the
// useEpisodeChapters migration is the precedent).

import { useCallback } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { selectAnswerText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useAudioTranscription } from "@/features/audio/hooks/useAudioTranscription";
import {
  DEFAULT_EXTRACTOR_FOCUS,
  DEFAULT_YOUTUBE_TIMESTAMP_INSTRUCTION,
  MIN_SCRAPE_CHARS,
} from "./constants";

export interface UseSourceResolvers {
  /** Scrape a URL, then run the Web Content Extractor agent. Returns cleaned text. */
  resolveWebsite: (
    url: string,
    onProgress?: (text: string) => void,
  ) => Promise<string>;
  /** Run the YouTube Transcription & Research agent on a YouTube URL. */
  resolveYouTube: (
    url: string,
    onProgress?: (text: string) => void,
  ) => Promise<string>;
  /**
   * Upload the audio file durably (via @/features/files), then transcribe it.
   * Returns the transcript text. `uploadedFileId` is reported so the caller can
   * persist a durable reference if desired.
   */
  resolveAudioFile: (
    file: File,
    onStatus?: (status: string) => void,
  ) => Promise<{ text: string; fileId: string | null }>;
  /** True while any agent run is streaming (website/youtube cleanup). */
  agentRunning: boolean;
  /** True while the audio file is uploading or transcribing. */
  audioBusy: boolean;
}

// DB-managed mandates (declared in aidream client mandates; rebind from
// /administration/agents/mandates). Passed as `mandateKey` so resolution —
// binding `config_overrides` included — happens inside the canonical launcher.
const WEB_EXTRACTOR_MANDATE_KEY = "podcast_client.web_content_extractor";
const YOUTUBE_RESEARCH_MANDATE_KEY = "podcast_client.youtube_research";

export function useSourceResolvers(): UseSourceResolvers {
  const { scrapeUrl } = useScraperApi();
  // ONE live-run hook for both URL resolvers: the panel resolves one source at
  // a time, and the hook's own lifecycle (destroy the previous instance on
  // re-run/unmount) is exactly the reuse we want between fetches.
  const { run, isRunning: agentRunning } = useLiveAgentRun();
  const store = useAppStore();
  const { upload, uploading } = useFileUpload();
  const { transcribe, isTranscribing } = useAudioTranscription();

  /**
   * Bridge the run's live answer text into the caller's `onProgress` — the
   * same text-into-textarea behavior the old `onChunk` gave, read off the
   * canonical request selectors (answer text only, never chain-of-thought).
   * Returns the `onRequestId` to pass to the run plus a `stop` for cleanup.
   */
  const progressFeed = useCallback(
    (onProgress?: (text: string) => void) => {
      if (!onProgress) {
        return { onRequestId: undefined, stop: () => {} } as const;
      }
      let unsubscribe: (() => void) | null = null;
      let last = "";
      const onRequestId = (requestId: string) => {
        const answerText = selectAnswerText(requestId);
        unsubscribe?.();
        unsubscribe = store.subscribe(() => {
          const text = answerText(store.getState());
          if (text && text !== last) {
            last = text;
            onProgress(text);
          }
        });
      };
      return {
        onRequestId,
        stop: () => {
          unsubscribe?.();
          unsubscribe = null;
        },
      } as const;
    },
    [store],
  );

  const resolveWebsite = useCallback(
    async (url: string, onProgress?: (text: string) => void) => {
      const scraped = await scrapeUrl(url);
      const raw = scraped?.textContent?.trim();
      if (!raw) {
        throw new Error("The page returned no readable text to clean.");
      }
      // A successful scrape returns substantial page text. Under ~2000 chars
      // means the scrape FAILED (JS-only page, paywall, bot block) — that's a
      // different problem from "thin content", so we stop here with a clear
      // message rather than feeding a near-empty page to the script writer.
      if (raw.length < MIN_SCRAPE_CHARS) {
        throw new Error(
          `That page only yielded ${raw.length} characters — likely a failed or ` +
            `blocked scrape (paywall, login wall, or a JS-only page). Try a ` +
            `different URL, or paste the content directly.`,
        );
      }
      const feed = progressFeed(onProgress);
      try {
        const cleaned = await run<string>({
          mandateKey: WEB_EXTRACTOR_MANDATE_KEY,
          surfaceKey: "podcast-source:web-extractor",
          sourceFeature: "podcasts",
          // The cleaned text IS the product — no JSON middleman.
          expect: "text",
          variables: {
            scraped_content: raw,
            focus_area: DEFAULT_EXTRACTOR_FOCUS,
          },
          ...(feed.onRequestId ? { onRequestId: feed.onRequestId } : {}),
          coerce: (value) => (typeof value === "string" ? value : ""),
        });
        return (cleaned || raw).trim();
      } finally {
        feed.stop();
      }
    },
    [scrapeUrl, run, progressFeed],
  );

  const resolveYouTube = useCallback(
    async (url: string, onProgress?: (text: string) => void) => {
      const feed = progressFeed(onProgress);
      let text: string;
      try {
        text = await run<string>({
          mandateKey: YOUTUBE_RESEARCH_MANDATE_KEY,
          surfaceKey: "podcast-source:youtube-research",
          sourceFeature: "podcasts",
          // Transcript + research prose IS the product — no JSON middleman.
          expect: "text",
          variables: {
            youtube_url: url,
            timestamp_instruction: DEFAULT_YOUTUBE_TIMESTAMP_INSTRUCTION,
          },
          ...(feed.onRequestId ? { onRequestId: feed.onRequestId } : {}),
          coerce: (value) => (typeof value === "string" ? value : ""),
        });
      } finally {
        feed.stop();
      }
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error("The video returned no transcript or research text.");
      }
      return trimmed;
    },
    [run, progressFeed],
  );

  const resolveAudioFile = useCallback(
    async (file: File, onStatus?: (status: string) => void) => {
      // Durable upload through the universal file handler (doctrine: never
      // call an object-store SDK directly; uploads only via @/features/files).
      onStatus?.("Uploading audio…");
      let fileId: string | null = null;
      try {
        const normalized = await upload(
          { kind: "file", file },
          { metadata: { origin: "podcast_studio_source" } },
        );
        fileId = normalized.fileId ?? null;
      } catch {
        // Upload is best-effort durability; transcription still runs on the
        // local blob below, so a failed upload doesn't block the user.
        fileId = null;
      }

      onStatus?.("Transcribing…");
      const result = await transcribe(file);
      if (!result.success || !result.text.trim()) {
        throw new Error(result.error || "Transcription returned no text.");
      }
      return { text: result.text.trim(), fileId };
    },
    [upload, transcribe],
  );

  return {
    resolveWebsite,
    resolveYouTube,
    resolveAudioFile,
    agentRunning,
    audioBusy: uploading || isTranscribing,
  };
}
