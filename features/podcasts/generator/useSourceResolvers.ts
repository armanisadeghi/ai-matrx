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

import { useCallback } from "react";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import { useFileUpload } from "@/features/files";
import { useAudioTranscription } from "@/features/audio/hooks/useAudioTranscription";
import {
  WEB_CONTENT_EXTRACTOR_AGENT_ID,
  YOUTUBE_RESEARCH_AGENT_ID,
  DEFAULT_EXTRACTOR_FOCUS,
  DEFAULT_YOUTUBE_TIMESTAMP_INSTRUCTION,
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

export function useSourceResolvers(): UseSourceResolvers {
  const { scrapeUrl } = useScraperApi();
  const { run, running: agentRunning } = useRunAgent();
  const { upload, uploading } = useFileUpload();
  const { transcribe, isTranscribing } = useAudioTranscription();

  const resolveWebsite = useCallback(
    async (url: string, onProgress?: (text: string) => void) => {
      const scraped = await scrapeUrl(url);
      const raw = scraped?.textContent?.trim();
      if (!raw) {
        throw new Error("The page returned no readable text to clean.");
      }
      const cleaned = await run({
        agentId: WEB_CONTENT_EXTRACTOR_AGENT_ID,
        userInput: raw,
        variables: {
          scraped_content: raw,
          focus_area: DEFAULT_EXTRACTOR_FOCUS,
        },
        onChunk: onProgress,
      });
      return (cleaned || raw).trim();
    },
    [scrapeUrl, run],
  );

  const resolveYouTube = useCallback(
    async (url: string, onProgress?: (text: string) => void) => {
      const text = await run({
        agentId: YOUTUBE_RESEARCH_AGENT_ID,
        userInput: url,
        variables: {
          youtube_url: url,
          timestamp_instruction: DEFAULT_YOUTUBE_TIMESTAMP_INSTRUCTION,
        },
        onChunk: onProgress,
      });
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error("The video returned no transcript or research text.");
      }
      return trimmed;
    },
    [run],
  );

  const resolveAudioFile = useCallback(
    async (file: File, onStatus?: (status: string) => void) => {
      // Durable upload through the universal file handler (doctrine: never
      // touch supabase.storage directly; uploads only via @/features/files).
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
