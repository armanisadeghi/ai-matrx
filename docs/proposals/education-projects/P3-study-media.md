# P3 — Generated Study Media (Audio Study + Mind Maps)

> **Status date:** 2026-07-07 · **Wave 1, priority tier 3** · One agent, human in the loop.
> Read [`README.md`](./README.md) and the vision doc §9 (Audio Study) + §10 (Visual Learning).

## Objective

Turn any study material into consumable media: broadcast-quality **audio** (podcast-style
overviews, two-voice dueling debates, multi-host panels, spoken audio-review quizzes) and
**visual concept maps** (mind maps, knowledge graphs, diagram types) with clickable nodes linking
back to cards and explanations. These are the auditory and visual learning pillars — both areas
where every listed competitor is weak, and where this platform already owns most of the hard
infrastructure.

**Phasing rule: audio first.** Audio Study has overwhelming reuse (the entire podcast pipeline is
production-grade); mind-maps is the lighter, weaker-reuse half. Ship audio to done, then mind maps.

## Current state (verified — build on this)

- **Routes are stubs:** `app/(core)/education/audio-study/{page,new,[id],[id]/edit}` and
  `app/(core)/education/mind-maps/{same}` — all `EduToolComingSoon`.
- **The audio pipeline is a shipped product:** `features/podcasts` (studio + generation,
  `features/podcasts/FEATURE.md`), `features/audio`, the aidream `podcast_*.py` suite, endpoint
  `{base}/podcast/generate`, **multi-speaker 1–20 hosts already supported**, agent_run-backed
  lifecycle with recovery + per-asset regeneration. Flashcards Phase 7 already generates a podcast
  from a deck (`writeHelper` agent `df0e6c90-…` is the helper flow) — your job is to generalize
  that into a standalone education tool, not to build audio generation.
- **Playback/durability rules exist:** all media renders via `<InlineMediaRef>` / `useFileSrc`,
  durable refs (`file_id`), never raw signed URLs (`features/files/handler/FEATURE.md`).
- **Visual substrate exists:** content-IR kind system (`features/content-ir/FEATURE.md`,
  `docs/SHAPE_SYSTEM.md`) + the mermaid render block (web-complete). Diagram *kinds* may already
  exist in the kind registry — check `content_ir.kind_definition` before inventing any shape.

## Scope

**IN**
- **Audio Study tool** (`/education/audio-study/**`): generate from a deck, notes, or topic —
  (a) audio overview, (b) two-voice debate with genuinely distinct voices/positions,
  (c) multi-host panel, (d) audio review session (questions read aloud; student answers verbally;
  graded via the `gradeSpokenAnswer` primitive — "FastFire in audio-only format").
  Library list page, generation flow with live progress (agent_run lifecycle + recovery, exactly
  as podcasts does), player, regenerate-per-asset.
- **Mind Maps tool** (`/education/mind-maps/**`): AI-generated mind map / knowledge graph /
  diagram types from a deck/note/topic via the content-IR + mermaid substrate; **clickable nodes**
  that link to the underlying card or open an explanation (AskTutor integration point once P2
  lands); view + edit (regenerate/re-scope) pages.
- Canonical persistence for both: education media artifacts follow the content-model pattern
  (canonical table(s) + associations edges to source deck/note + `visibility` + registry entry) —
  or, where podcasts' `pc_*` tables already fit, associate rather than duplicate. Decide with
  evidence, document the decision.
- Study-spine hook: audio-review answers record via `studyService.recordAttempt`
  (`method: 'audio_review'`).
- Sharing + entitlement call sites per the P7/P8 day-1 signatures (audio generation is one of the
  most expensive metered capabilities — wrap it first).

**IN — competitive mandates (added 2026-07-07 from the market research)**
- **NotebookLM-grade naturalness is the floor, not the target.** Audio Overview went viral on
  SoundStorm-level naturalness (17M MAU, 43% students) — evaluate our generated output against it
  honestly at kickoff; if the gap is material, that's an aidream escalation (voice/model config),
  not something to ship under.
- **Adaptive audio — the thing NotebookLM structurally can't do:** debates/panels that *target
  the listener's weak areas* (read `item_mastery` when composing the brief for the generation
  agent) and audio review sessions scheduled from the FSRS due queue. Their audio is a one-shot
  summary; ours is part of the study loop.
- **TrustEnvelope (P0):** audio scripts are generated content — grounded in the source deck/notes
  with the source list visible on the artifact page.

**OUT**
- Audio pipeline internals (aidream-owned; you consume). Diagram render primitives (content-IR
  owned). Study songs / musical mnemonics (vision "coming soon" — Wave 2). The tutor itself (P2).
  Notes conversion UI (P4 calls your generator via the converter contract). "Talk to the hosts"
  interactive audio (Wave-2 — flag it in the feature doc as the known NotebookLM follow-on).

## Deliverables / Definition of done

1. From a real deck: generate an overview, a debate (two distinct voices), and a panel → all play
   in the app from durable refs, survive refresh, and are shareable.
2. An audio review session: questions spoken, user answers by voice, grades recorded to the spine.
3. From a real deck/note: generate a mind map that renders, with clickable nodes resolving to
   cards/explanations; shareable.
4. Generation is recoverable (agent_run lifecycle) — a refresh mid-generation resumes, never
   orphans.
5. Both tools flipped `live` in `tools.ts`; admin map updated; `features/education/media`
   documented; generator exposed behind the P4 converter contract
   (`targetKind: 'audio' | 'mind_map'`).

## Surfaces touched

- `app/(core)/education/audio-study/**`, `app/(core)/education/mind-maps/**` (replace stubs)
- New `features/education/media/**` (thin orchestration over podcasts/audio/content-IR)
- `features/podcasts` / `features/audio` (consume; small generalizations upstreamed, not forked)
- Content-IR kind registry (new/activated kinds for map shapes — via the `shape-system` skill)
- Possibly new `education.*` media tables (or associations onto `pc_*`) + registry entries

## Dependencies & contracts

- Podcast suite ✅ (aidream deployed), agent pipeline ✅, content-IR ✅, voice grading ✅.
- **Consumes:** P7 `useAccess`, P8 `useEntitlement` signatures (day 1).
- **Publishes:** its generators behind P4's converter contract.
- Mind-maps timing is Arman's call (README flag 4) — default: build after audio is done.

## Build guidance

- Invoke `shape-system` before touching any kind/`__kind` asset; `overlay-system` for any
  panel/dialog; `code-splitting` before adding heavy client components (audio players, graph
  renderers are exactly the bloat class CLAUDE.md warns about — dynamic + conditional).
- Copy the podcasts runs/recovery UX rather than re-deriving it
  (`project` memory: podcast runs / recovery / per-asset regen shipped).
- No emojis, Lucide only; media via `fileHandler` exclusively.
- `type-safety`, then `finalize-and-ship`.

## Verification

Real generation runs against the live backend (no simulated streams): play all three audio
formats end-to-end; kill the tab mid-generation and confirm recovery; complete a voice
audio-review with spine rows verified via SQL; click mind-map nodes through to cards. Provide
Arman exact routes + expected outcomes.
