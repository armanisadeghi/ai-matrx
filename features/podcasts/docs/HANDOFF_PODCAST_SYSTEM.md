# Podcast System — Authoritative Handoff & Known-State

**Last updated: 2026-08-09** (host_count capped at 10 — see §5.2). This handoff records the state
of the podcast generation system across both repos. If you're taking over, read
this top to bottom — it tells you exactly what works, what doesn't, and what's a
known weakness. Supersedes `HANDOFF_2026-06-12.md` (archived at `docs/archive/2026/HANDOFF_2026-06-12.md`).

- **Server (the pipeline):** `aidream` → `packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py` + the primary contract **`PODCAST_PIPELINE.md`** beside it. **Read PODCAST_PIPELINE.md** — it is the law for the flow.
- **Frontend:** `matrx-frontend` → `features/podcasts/` + `app/(core)/podcast/`.
- **DB:** Supabase `txzxabzwovsujtloxrus` (shared by both).
- **Work on `main` in both.** Server code is **committed but the user deploys it.**

---

## 1. The one-paragraph status

The flow is now `Content → Script → Audio` with **hard gates** between stages, and
it produces real audio across every starting point and host count we've tested
(1, 2, 3, 6, and — verified live on prod 2026-08-08 — 10, the maximum).
The class of failure that prompted the rebuild — a script agent's thinking text
leaking into TTS, and the "speaker name mismatch" error — is now **structurally
impossible**: nothing reaches TTS that isn't a validated `<podcast_dialogue>`
script with exactly the requested number of speakers and names that match.
**Large casts are settled: `host_count` is capped at 10** (2026-08-09, Arman's
ruling) because ElevenLabs `text_to_dialogue` accepts at most 10 distinct
voices per request and every speaker gets their own. 10-host episodes render
end-to-end on production; 14 and 20 were how we found the wall, and are no
longer accepted (§5.1/§5.2).

---

## 2. What's verified (with evidence)

| Capability                                                         | Evidence                                                                                                             | Status                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| GATE logic (extract / validate / count / names / speaker_settings) | `scripts/podcast_gate_tests.py` — **26/26 pass**, no money                                                           | ✅                                            |
| Thinking-text never reaches TTS (the original bug)                 | unit test "thinking-only RAISES (the prod bug)"                                                                      | ✅                                            |
| Speaker-name mismatch fixed at our layer                           | unit "cast uses SCRIPT names not pinned Alex/Sarah" + real run `two_host_custom_names` (Maya/Rex through Google TTS) | ✅                                            |
| Exact speaker count (N means N)                                    | unit tests + real 1/2/3/6-host runs                                                                                  | ✅                                            |
| `partial_content` → script writer (no extractor)                   | real run `partial_content` PASS+audio                                                                                | ✅                                            |
| `full_content` already-a-script → skip generation                  | real run `pasted_script` (22s, "skipping generation")                                                                | ✅                                            |
| 1/2/3/6 hosts produce audio (Gemini + ElevenLabs)                  | real runs `solo`/`two_host_custom_names`/`three_host`/`six_host_roundtable` all PASS+audio                           | ✅                                            |
| **10 hosts produce audio (the maximum cast)**                      | live PROD run `afd2d558` — every stage `completed`; exact GATE 2 count + matching `<speaker_settings>`. (14/20 also rendered on 08-08, before the cap; they are no longer accepted.) | ✅ (2026-08-08)                               |
| Content gate rejects thin sources                                  | thin fixtures rejected at GATE 1 (331/358 chars)                                                                     | ✅                                            |
| Blog / show-notes generate + publish                               | `EpisodeContentStudio`, `pc_articles` live                                                                           | ✅ wired (live-UI run still pending — see §6) |
| Create form: 1–10 hosts, all formats, per-host names/voices        | live DOM check, zero false "Coming Soon"                                                                             | ✅                                            |

**Two test suites (run these first when you take over):**

```bash
cd aidream
uv run python scripts/podcast_gate_tests.py                 # deterministic, free, ~30s
uv run python -u scripts/podcast_e2e_matrix.py <scenario…>  # real agents/$$, truncated audio
# scenarios: topic full_content partial_content pasted_script file_url file_url_real
#            two_host_custom_names solo three_host six_host_roundtable
#            roundtable_10   (the maximum cast; 14/20 no longer accepted)
```

---

## 3. The gates (what stops a bad run)

Full detail in `PODCAST_PIPELINE.md` §3. Summary:

- **GATE 1 — content ≥ 1000 chars** (`_MIN_CONTENT_CHARS`). Script-shaped input is
  exempt. Below → prep fails, run stops (resumable).
- **GATE 2 — `_validate_script`**: a usable `<podcast_dialogue>` block, ≥1 turn,
  **exactly `host_count` distinct speakers**, all requested names present, and (if
  declared) `<speaker_settings>` matches the actual labels. Fail → script stage
  fails, **audio never launches**.
- **GATE 3 — `_audio_stage_result`**: success with no audio URL is rewritten to
  failed (resume-safe).
- **Voice config is built from the script at our layer** (`_effective_speakers`):
  request names → `<speaker_settings>` → dialogue labels. TTS never gets a name
  the transcript doesn't contain. We never rely on the API to fix names.

---

## 4. Exact IDs / contracts

**Audio routing:** ≤2 hosts → Google Gemini; ≥3 → ElevenLabs `text_to_dialogue`.

**Agents (master / pinned version):**

- Script (legacy, 2-host, best quality): `podcast_script_educational` `4541ba46`, `_news` `23ca9704`, `_persian` `3456f665`.
- Script (generic, host-count-aware) — **repinned 2026-08-08** to the hardened versions: solo `3f0b22c2`, multihost (2–4) `29bebcba`, roundtable (5–10) `b23156bf`. The DB slot (`agent.slot_definition`, `podcast.*_script`) is the pin authority — repin there, never in code.
- Audio: Gemini english `055c6d30` / persian `21238b08`; **ElevenLabs dialogue `podcast_audio_dialogue` master `88f05360`, version `293425be`** (model `eleven_v3` = `7b1bc855…`).
- Companion: blog `58204bd9`, show-notes `b1910198`, chapters/title/audience built but unwired.

**`<speaker_settings>` contract (optional, the robustness path):** a script agent
MAY append after the dialogue block:
`<speaker_settings>{"speakers":[{"name":"Alex","voice":"orus"}]}</speaker_settings>`.
The pipeline prefers it for voice assignment; GATE 2 cross-checks it. **All three
generic script agents REQUIRE and emit it as of 2026-08-08** (name + gender,
never voice — the server owns voice selection); verified in persisted prod
scripts at 1/10/14/20 hosts (14/20 predate the 10-host cap).

**DB:** `pc_episodes.{script,host_count,speakers}`, `pc_articles` (kind blog|show_notes, unique `(episode_id,kind)`).

---

## 5. KNOWN PROBLEMS / WEAKNESSES / OUTSTANDING — read this

Ordered by importance. These are the honest gaps.

1. ~~**3–20 host audio rejected ElevenLabs dialogue turns at typed
   `LLMParams`.**~~ **FIXED 2026-08-08.** `TtsVoice` accepts homogeneous
   `{text, voice_id}` lists again and regression coverage verifies the typed
   override reaches `TTSVoiceConfig.dialogue_turns`. Failed runs remain
   resumable through `POST /api/podcast/resume/{run_id}`.

2. ~~**Large casts (7–20 hosts) are UNVERIFIED.**~~ **VERIFIED END-TO-END ON
   PROD at 10/14/20 hosts (2026-08-08)** — script AND audio. The
   roundtable/multihost/solo agents were hardened (required
   `<speaker_settings>` + a roster-first / post-write count-check protocol; the
   roundtable user message's "Output only the dialogue block" line — which
   contradicted and suppressed the declaration — removed) and their
   `podcast.*_script` slots repinned (roundtable v4 `e7cad8a6`, multihost v6
   `29bebcba`, solo v4 `3f0b22c2`). Live prod runs against
   `/api/podcast/generate` (truncated audio, media off): 10 → 10 distinct
   speakers, 14 → 14, 20 → 20, each with a `<speaker_settings>` declaration
   matching the dialogue labels exactly (verified in `chat.agent_run_stage`
   output; GATE 2 passed at all three sizes, ~40–50s per script on Gemini 3.6
   Flash). `scripts/podcast_e2e_matrix.py` gained `roundtable_10/14/20`
   scenarios. **Audio: ALL THREE GREEN on prod** — 10-host (`afd2d558`),
   14-host (`25031425`), 20-host (`966bfb95`), every stage `completed`. Getting
   there took two server fixes, both shipped: the typed-`LLMParams` regression
   (item 1) and a hard PROVIDER limit found at 14/20 — ElevenLabs
   `text_to_dialogue` accepts at most **10 distinct voice_ids per request**
   (`max_voices_exceeded "13/10"` / `"17/10"`). `_ELEVENLABS_MAX_DISTINCT_VOICES`
   now caps assignment and SHARES gender-matched voices beyond 10 (labels stay
   distinct, so GATE 2 and transcripts are unaffected; loud warning on every
   firing), plus a pre-flight `PodcastConfigError` when explicit per-speaker
   pins force past the cap — raised before the paid call. **Open product call
   **DECIDED 2026-08-09 (Arman):** cap `host_count` at 10 rather than build
   multi-request render + stitch. The interim voice-SHARING workaround was
   deleted with the cap — two speakers never share a voice again. 11–20 is now
   a 422 at the API boundary, and the roundtable agent + slot advertise 5–10.

3. **`<speaker_settings>` is now REQUIRED and emitted (2026-08-08).** All three
   generic script agents demand the declaration (name + gender, never voice —
   the server owns voice selection and pool rotation) and treat it as their
   final cast self-check. Verified in persisted prod scripts at 1/10/14/20
   hosts. GATE 2 cross-checks the declared names against the dialogue and
   rejects a lying declaration.

4. ~~**ElevenLabs has no live streaming.**~~ **DONE 2026-08-08.** The provider
   emits ordered MP3 `audio_stream_chunk` events plus `audio_stream_end`; the
   studio selects a MediaSource player for MP3 and retains Web Audio for Gemini
   PCM. Real authenticated 2-host Gemini and 3-host ElevenLabs studio runs both
   played before generation completed and handed off to canonical files.

5. **Persisted script may contain the agent's thinking text.** The `create_script`
   stage output is the agent's _full_ output (which can include reasoning before
   the `<podcast_dialogue>` block), and that's what lands in `pc_episodes.script`
   → so blog/show-notes/transcript can inherit thinking text. The clean dialogue
   is available (`_extract_dialogue`); persisting that instead is a 1-line change
   in `_validated_script_stage` but was left to avoid changing the tested shape.
   **Quality issue, not a crash.**

6. **`partial_content` is no longer cleaned.** Per the user's instruction, rough
   notes / scraped / transcribed text now pass straight to the script writer (the
   file extractor is `file_url`-only). The script writer handles raw notes well
   (proven), but there is no longer an intermediate cleaning agent for messy text.

7. ~~Script-agent SELECTION is not a registry~~ **SUPERSEDED by Agent Slots
   (2026-08-08).** Every pipeline agent resolves through a `podcast.*` slot in
   `agent.slot_definition` (admin console `/administration/agents/slots`;
   declarations in `aidream/services/agent_slots/podcast_slots.py`). Swapping
   or upgrading an agent is a DB repin. The band ROUTER (which slot runs for a
   given host count/format/language) is still code in `_create_script` —
   fine until a custom per-format agent actually exists; slot in a new band
   by adding a slot + a router branch.

8. **4 post-prep agents still draft** (`podcast_post_prep_{translation,
summarization,fact_checking,expansion}`) → the create form's "Pre/Post-script
   processing" is honestly badged "Coming Soon". Build:
   `uv run python scripts/build_agents.py <names…>`, then wire `post_prep_option`.

9. **Chapters unwired.** `podcast_chapter_marker` exists; the run page still shows
   a "Chapter markers" Coming-Soon card.

10. ~~Languages: only en-US + fa-IR enabled~~ **ALL 24 languages enabled
    (2026-08-08)** — generic script agents take `language` (server maps locale
    codes → plain names), both TTS providers are natively multilingual.
    Per-locale voice QUALITY is unverified beyond en/fa — spot-check top
    locales with real ears.

11. ~~URL-scrape ≥2000-char gate~~ **DONE.** `useSourceResolvers.resolveWebsite`
    now rejects a scrape under `MIN_SCRAPE_CHARS` (2000) with a distinct
    "failed/blocked scrape" message, before it reaches the cleaner/script writer.

---

## 6. Verification still pending (not yet done)

- ~~A full live run through the browser UI for streaming audio.~~ **DONE
  2026-08-08** for both Gemini PCM and ElevenLabs MP3, including Play/Pause,
  advancing position/rendered duration, and canonical-player handoff. The
  blog/show-notes generate→publish UI remains separate and unverified here.
- **A listening check on a 10-host episode.** It renders end-to-end (§5.2) but
  nobody has listened: 10 distinct voices in one dialogue is the top of the
  range, so confirm by ear that it is followable before advertising that size.
  (The old "voices are shared above 10" caveat is gone — the cap removed it.)

---

## 7. File map

**Server (aidream):**

- `packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py` — the whole pipeline.
- `…/agent_runners/PODCAST_PIPELINE.md` — the flow contract (READ FIRST).
- `scripts/podcast_gate_tests.py` — gate unit tests.
- `scripts/podcast_e2e_matrix.py` — real-run scenario matrix.
- `packages/matrx-ai/matrx_ai/config/tts_config.py` — voice config translation (Google/ElevenLabs).
- `packages/matrx-ai/matrx_ai/providers/eleven_labs/` — ElevenLabs provider (proven multi-lang in `direct_dialogue.py`).
- `aidream/api/routers/podcast_generator.py` — HTTP/stream wrapper + episode persistence.

**Frontend (matrx-frontend):**

- `features/podcasts/generator/` — form, constants, voices, reduce, useEpisodeArticles.
- `features/podcasts/studio/` — run page, EpisodeContentStudio, useStudioRun.
- `features/podcasts/components/player/` — players, episode/blog pages.
- `features/audio/streamingPcmPlayer.ts` — client PCM player (Gemini live audio).
- `features/audio/streamingMp3Player.ts` — client MediaSource player (ElevenLabs live audio).
- `app/(core)/podcast/` — routes (`studio/create`, `studio/run/[id]`, `[slug]`, `[slug]/blog`).

---

## 8. What only the user can do

1. **Deploy aidream** (unblocks everything in prod).
2. Update the script-agent prompts to emit `<speaker_settings>` (optional robustness).
3. Build the 4 post-prep agents; decide on chapters.
4. Provide curated ElevenLabs voices (swap into `features/podcasts/generator/voices.ts`).

## 9. Commit trail (this body of work, aidream)

- ElevenLabs agent wired + 1/3/6-host verified.
- Gate enforcement (`Content→Script→Audio`, content + script gates, routing fix).
- Exact speaker count + names-always-from-script + `<speaker_settings>` contract.
  (All on `main`; bundled into the user's recent podcast commits — `git log --oneline -- packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py`.)
