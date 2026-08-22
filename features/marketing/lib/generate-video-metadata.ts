/**
 * generate-video-metadata.ts — headless agent-driven metadata authoring for
 * ONE video in the site Media workspace (the Videos view). Reuses the ONE
 * headless shell (`runHeadlessAgent` + `waitForAnswerText` from
 * generate-page-image.ts) — never a second launch/execute/destroy loop.
 *
 * The agent answers with a strict `<video_metadata>{json}</video_metadata>`
 * wrapper (same tagged-answer contract as the image prompt generator's
 * `<image_prompt>`); callers persist the parsed result onto the video's
 * `web.brand_asset` row (`title`, `notes`, `data.video_metadata`).
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";
import {
  runHeadlessAgent,
  waitForAnswerText,
} from "@/features/marketing/lib/generate-page-image";

/**
 * The Mandate that decides WHICH agent writes video metadata (system default:
 * "Marketing Video Metadata Writer"; users rebind it at `/agents/mandates`).
 * Declared server-side in aidream `services/mandates/client_mandates.py`; its
 * Provision offers `video_context` + `site_context`. The launch thunk resolves
 * it — never resolve here and pass an `agentId` (that drops the binding's
 * `config_overrides`). The agent answers inside `<video_metadata>…</video_metadata>`;
 * that contract is the AGENT's, declared in the DB — this note mirrors it.
 */
export const VIDEO_METADATA_MANDATE_KEY = "marketing.video_metadata";

export interface VideoMetadataResult {
  title: string;
  description: string;
  keywords: string[];
  /** schema.org VideoObject JSON-LD, ready for a page head. */
  schemaOrg: Record<string, Json>;
}

/**
 * Pull the metadata out of the agent's `<video_metadata>…</video_metadata>`
 * wrapper. Returns null on a missing wrapper, unparseable JSON, or a payload
 * missing its required keys — callers report loudly, never guess.
 */
export function extractVideoMetadata(
  answerText: string,
): VideoMetadataResult | null {
  const match = /<video_metadata>([\s\S]*?)<\/video_metadata>/i.exec(
    answerText,
  );
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  // The agent may fence the JSON inside the wrapper — strip a ``` fence.
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  // JSON.parse can only produce Json-shaped values.
  let parsed: Json;
  try {
    parsed = JSON.parse(unfenced) as Json;
  } catch {
    return null;
  }
  if (!isJsonRecord(parsed)) return null;
  const record = parsed;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  if (!title || !description) return null;
  const keywords = Array.isArray(record.keywords)
    ? record.keywords.filter(
        (keyword): keyword is string =>
          typeof keyword === "string" && keyword.trim() !== "",
      )
    : [];
  const schemaOrg = isJsonRecord(record.schema_org) ? record.schema_org : {};
  return { title, description, keywords, schemaOrg };
}

export type VideoMetadataOutcome =
  | { ok: true; metadata: VideoMetadataResult }
  | { ok: false; message: string };

export interface GenerateVideoMetadataArgs {
  /** Everything known about the video (URL/provider/pages/hints) as prose. */
  videoContext: string;
  /** Site + brand grounding (name, root URL, standards notes). */
  siteContext: string;
  surfaceKey: string;
}

/**
 * Run the metadata writer headlessly and return the parsed result. Fails
 * loudly with a caller-toastable message — never throws to the UI.
 */
export function generateVideoMetadata(args: GenerateVideoMetadataArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<VideoMetadataOutcome> => {
    try {
      const answer = await runHeadlessAgent(
        dispatch,
        {
          mandateKey: VIDEO_METADATA_MANDATE_KEY,
          surfaceKey: args.surfaceKey,
          userText: "Write the video metadata now.",
          variables: {
            video_context: args.videoContext,
            site_context: args.siteContext,
          },
        },
        (requestId) => waitForAnswerText(getState, requestId),
      );
      const metadata = extractVideoMetadata(answer);
      if (!metadata) {
        console.error(
          "[generateVideoMetadata] no usable <video_metadata> in answer:",
          answer,
        );
        return {
          ok: false,
          message:
            "The metadata agent answered without a usable <video_metadata> block.",
        };
      }
      return { ok: true, metadata };
    } catch (error) {
      console.error("[generateVideoMetadata]", error);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Metadata run failed.",
      };
    }
  };
}
