# Voice Catalog — read it straight from Supabase (no server hop)

**What changed:** every TTS voice (ElevenLabs, Google, and every provider we add
later) now lives in one table in the **Matrx Main** Supabase project:
**`public.voices`**. Each row carries a **public CDN sample URL** you can drop
straight into an `<audio>` tag. This replaces the hardcoded rosters in
`features/podcasts/generator/voices.ts` and the
`voiceSamplesManifest.ts` file.

**Why:** the frontend and backend kept drifting (the old hardcoded ElevenLabs
IDs were stale — wrong genders, broken voices). There is now ONE source of
truth. The client reads it **directly via Supabase** and plays samples **from
the CDN** — the Python server is never in this path (it has no business serving
data you can read yourself).

---

## Where & how

Same Supabase project you already use. The table is world-readable for the
shared catalog (RLS allows anonymous + authenticated `SELECT` on enabled,
non-deleted catalog rows), so a normal client query just works:

```ts
import { createClient } from "@/utils/supabase/client";

export interface Voice {
  id: string;
  provider: "elevenlabs" | "google" | string;
  provider_voice_id: string;   // the value you send when generating (voice_id / name)
  name: string;
  voice_type: "builtin" | "shared" | "matrx_custom" | "user_created";
  gender: "male" | "female" | "neutral" | "unknown";
  accent: string | null;
  age: string | null;
  language: string | null;
  languages: string[];
  tags: string[];              // use-cases: narration, news, conversational, ...
  quality_score: number | null; // 0-10, higher = better (favor these)
  description: string | null;
  style: string | null;        // one-word hint ("Warm", "Firm")
  sample_url: string | null;   // PUBLIC CDN mp3 — bind straight to <audio>
  preview_url: string | null;  // provider's own preview (fallback only)
  enabled: boolean;
  is_verified: boolean;        // true once a human confirmed gender/quality
  sort_order: number;
}

export async function fetchVoices(provider?: string): Promise<Voice[]> {
  const supabase = createClient();
  let q = supabase
    .from("voices")
    .select("*")
    .eq("enabled", true)
    .order("provider", { ascending: true })
    .order("quality_score", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });
  if (provider) q = q.eq("provider", provider);
  const { data, error } = await q;
  if (error) throw error;
  return data as Voice[];
}
```

### Playing a sample

`sample_url` is a permanent `cdn.matrxserver.com` URL. No API call, no auth:

```tsx
<audio src={voice.sample_url ?? voice.preview_url ?? undefined} controls />
```

If both are null, render a disabled "preview unavailable" control — never a
broken player.

---

## Provider bands (unchanged routing)

The server still routes by host count, so filter the picker the same way:

- **1–2 hosts → Google** (`provider = "google"`). `provider_voice_id` is the
  Gemini voice name (e.g. `kore`).
- **3–20 hosts → ElevenLabs** (`provider = "elevenlabs"`).
  `provider_voice_id` is the ElevenLabs `voice_id`.

```ts
const provider = hostCount <= 2 ? "google" : "elevenlabs";
const voices = await fetchVoices(provider);
```

The cast you send to the server is unchanged (`{ name, voice, gender }` per
speaker) — just populate `voice` from `provider_voice_id` and `gender` from the
row.

---

## The four voice types (`voice_type`)

1. **`builtin`** — the provider's built-in stable voices (what we ship today).
2. **`shared`** — provider shared/community voices (other people's).
3. **`matrx_custom`** — custom voices WE offer, generated + audited by us.
4. **`user_created`** — voices a user creates on our platform.

The public catalog query returns `builtin` + `shared` + `matrx_custom`. A
signed-in user additionally sees their own `user_created` rows (RLS handles
this automatically — no extra filter needed).

---

## Migration checklist (what to delete)

- ❌ `features/podcasts/generator/voices.ts` hardcoded `ELEVENLABS_VOICES`,
  `GEMINI_VOICES`, `VOICE_SAMPLE_URLS` → replace with `fetchVoices()`.
- ❌ `features/podcasts/generator/voiceSamplesManifest.ts` and
  `scripts/generate-voice-samples.mjs` → no longer needed; samples come from
  `sample_url`.
- ✅ Keep your cast-building helpers (`buildCast`, `resolveSpeaker`) — just feed
  them the live list instead of the constant.

Genders for Google are being audited now and will flip from `unknown` to real
values in-place (same rows). Quality scores and richer tags are landing too —
sort by `quality_score desc` and you'll automatically favor the better voices
as they're rated.

---

## Notes

- **Live data** — query on load (or cache briefly). The catalog grows as we add
  providers and the team audits genders/quality.
- **Never re-host samples yourself.** `sample_url` is already a durable public
  CDN asset. Don't fetch + re-upload.
- Questions on the schema or RLS → ping the backend owner of `public.voices`
  (aidream `scripts/sync_voices.py`).
