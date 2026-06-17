// features/podcasts/generator/voiceCatalog.ts
//
// THE live voice catalog. Reads every TTS voice straight from the Matrx Main
// Supabase table `public.voices` (world-readable for the shared catalog; a
// signed-in user additionally sees their own `user_created` rows via RLS).
// This is the single source of truth — it replaces the old hardcoded rosters
// and the generated sample manifest. Samples are permanent public CDN URLs
// (`cdn.matrxserver.com`) bound straight to <audio>; the Python server is never
// in this read path. See docs/VOICE_CATALOG.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export type VoiceProvider = "google" | "elevenlabs" | (string & {});
export type CatalogGender = "male" | "female" | "neutral" | "unknown";
export type VoiceType = "builtin" | "shared" | "matrx_custom" | "user_created";

export interface Voice {
  id: string;
  provider: VoiceProvider;
  /** The value you send when generating (ElevenLabs voice_id / Gemini name). */
  provider_voice_id: string;
  name: string;
  voice_type: VoiceType;
  gender: CatalogGender;
  accent: string | null;
  age: string | null;
  language: string | null;
  languages: string[];
  tags: string[];
  quality_score: number | null;
  description: string | null;
  style: string | null;
  /** PUBLIC CDN mp3 — bind straight to <audio>. */
  sample_url: string | null;
  /** Provider's own preview (fallback only). */
  preview_url: string | null;
  enabled: boolean;
  is_verified: boolean;
  sort_order: number;
}

const SELECT_COLS =
  "id,provider,provider_voice_id,name,voice_type,gender,accent,age,language,languages,tags,quality_score,description,style,sample_url,preview_url,enabled,is_verified,sort_order";

/** Fetch every enabled catalog voice (+ the signed-in user's own, via RLS).
 *  Higher `quality_score` first so the picker favors better voices as they're
 *  rated; `name` is the stable tiebreaker. */
export async function fetchVoices(): Promise<Voice[]> {
  // `voices` isn't in the generated database.types.ts yet (added server-side;
  // regenerating the FE types needs a Supabase access token). Query through an
  // untyped client view so the typed client doesn't choke on the unknown table;
  // the row shape is asserted as Voice[] below. Remove this cast once
  // `pnpm db-types` is re-run and includes `voices`.
  const supabase = createClient() as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from("voices")
    .select(SELECT_COLS)
    .eq("enabled", true)
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Voice[];
}

// Module-level cache so the form + picker (and any future consumer) share ONE
// network round-trip per page. Cleared on explicit reload or on failure (so a
// transient error can be retried).
let cache: Promise<Voice[]> | null = null;

export function fetchVoicesCached(): Promise<Voice[]> {
  if (!cache) {
    cache = fetchVoices().catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

export function clearVoiceCache(): void {
  cache = null;
}
