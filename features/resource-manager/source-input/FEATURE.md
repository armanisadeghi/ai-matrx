# FEATURE.md — `source-input` (the one Source input)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-28`

---

## Purpose

ONE input for everything a person hands the AI to work from — their stored Sources, files, notes, records, and new material (pasted text, a web page, a YouTube video, a recording, an image) — plus "Just a topic". Every tool that builds a request from a person's Sources (Flashcards first, then all of Education, mandates, agents, workflows) renders this component and sends what it produces: a `source_set` of pointers, never blobs.

Campaign of record (design, frozen contract, register): common-docs `projects/unified-source-input/` — `DESIGN.md`, `REGISTER.md`. This file is only the local mechanics.

---

## Entry points

**Component**
- `components/SourceInput.tsx` — `<SourceInput surfaceKey kinds? max? required? defaultForm? title? attachTo? purpose? targetModelId?>`. The Podcast Studio look: a tile grid (`grid-cols-2 sm:grid-cols-4`), one big input area per tile, picked Sources as cards below. Opens on "Your sources" (reuse first). Configuration is by props only — never fork it.
- `components/YourSources.tsx` — the person's Sources, newest first (the ONE list read `features/sources/hooks/useSources`), search, kind select, Stage pills; "Search everything" opens the resource picker's list, whose search row is the ⌘K Knowledge bar.
- `components/SourceCard.tsx` — one Source: name (opens it — `EntityRef`, new tab), kind, size, state, "Use: <form> ▾", "Choose parts", remove, processing line with "Wait for the clean version".

**Hooks**
- `useSourceSet(surfaceKey, { defaultForm?, organizationId? })` — THE client handler. `sources`, `topic/setTopic`, `addReady/addPending/settle/fail/remove`, `updateRef` (form, parts, cap, delivery), `setWaitForClean`, `toSourceSet()`, `applySourceSet()` (from the review page), `manifest()`, `resolve()`, `totalChars`, `manifestError`, `settled`, and (USI-3b, additive) `restoring` (the saved draft is not read back yet — show a loading state, never "nothing picked"), `restart(id)`, `updateDraft(id, patch)`. Landing the same Source twice keeps ONE card and says so on it. A host that needs the payload calls `useSourceSet` with the SAME `surfaceKey` it gave `<SourceInput>`.
- `useSourceIntake(set, { attachTo })` — every way new material becomes a Source, through the existing doors (below). USI-3b adds `resume(card)` (land the kept input again), `retryFile(card, file)`, `fileLanded(card, processedDocumentId)`.
- `useSourceRecovery(set, intake, runner)` — UI-free: re-lands what a reload cut off (once per card, module-scope guard) and, for every stored-file card without a Source, reads the SERVER's state (`fileSource.ts`: `/files/{id}/rag-status` → keep / wait / start the one run / unreadable) — so a new upload, a reused copy, a picked file and a reload all end the same way, and a live run is never duplicated. Any UI on this core calls it once.
- `interrupted.ts` — THE decision for a card cut off mid-landing (`reloadedCard`): resume from the kept input, re-offer a file whose bytes were lost (keeps its name), or the plain remedy.

**Registry**
- `sourceKinds.ts` — THE tile list. Each entry names its existing door: a resource-picker sub-picker (`pickerViews`), an upload (`accept`), paste, URL, YouTube, audio, topic. `fallbackNote` is shown for kinds with no landing door of their own.

**API endpoints (aidream, called directly)**
- `POST /sources/manifest` / `POST /sources/resolve` — `sourceSetApi.ts`; wire types from `@ai-matrx/agents/sources` (frozen v1).
- `POST /sources/land`, `POST /sources/{id}/keep` — via `features/sources/api/sourcesApi.ts`.
- Scraper quick-scrape (lands at its result boundary) — `useScraperApi().scrapeUrl`.
- `POST /media/youtube/transcript`, `POST /audio/transcribe-file` — Start's readers, then landed.

**Redux**
- `instanceResources` (extended, no new slice): key `source-input:<surfaceKey>`; block type `source_ref`; `source` = `SourceDraft`, `preview` = the manifest entry; reducer `setResourceSource` added for pointer changes.
- `wizardDraft` (the generic persisted-draft primitive): wizardId `source-input:<surfaceKey>` holds `{ sources, topic }` — written on every change, restored on mount. Never lose input: a Source still landing keeps what the person handed over in `SourceDraft.input` (pasted text up to 2M characters, a link, an uploaded recording's file id — never bytes) until it settles. After a reload it is landed again by itself (the door dedupes by content hash, so it is the same Source); a failed one offers "Try again"; a file cut off mid-upload says it did not arrive, keeps its name, and offers "Choose it again".

**Knob**
- `sources.review_threshold_chars` (default 100,000; organizations and people may override) — above it, "Review what goes in" opens by itself once per crossing.

---

## How new material lands (DESIGN.md amendment A3)

| Tile | Door | Pointer |
|---|---|---|
| Paste text | `buildPastedTextLanding` → `POST /sources/land` (kept, filed against `attachTo`) | `processed_document` |
| A web page | scraper → lands → `keep` against `attachTo` | `processed_document` |
| Upload a file / An image | `useFileUpload().uploadMany` (SHA-256 "use the one you already have"), filed at once through `associationsService` in the direction `platform.association_types` registers (`fc_set → file`, `file → task`); then `useSourceRecovery` reads the server's state and starts the one run (`runForCldFile` → the orchestrator's file adapters, which land the Source) only when nothing is reading it; the Source is kept + filed through `keepSource` | `file` |
| A YouTube video | fallback: `fetchYouTubeTranscript` → `POST /sources/land` (identity `youtube:<id>`) | `processed_document` |
| A recording | fallback: upload → `transcribeCloudFile` → `POST /sources/land` (identity `audio-transcript:<fileId>`) | `processed_document` |
| Your files / A note / Documents & tables | `ResourcePickerMenu initialView` → `resourceToSourceRef` (lane USI-1's total mapping) | the record's token |
| Your sources | the row itself | `processed_document` |

## Review what goes in

`openSourceReview(sourceSet, options)` from `review/` (lane USI-4 owns that folder). The header link is always there; the input opens it itself above the knob. An `applied` or `add_more` outcome is written back with `applySourceSet`.

---

## Demo

- `app/(dev)/demos/source-input/page.dev.tsx` — three configurations (every kind; no images, max 3; one required Source) and, under each, the `source_set` the host would send and a "Get the grounded text" button (`resolve()`).

---

## Known gaps (named, not silent)

- YouTube and recordings have no landing door of their own; the transcript is read client-side and landed. Tracked in DESIGN.md A3 as fallback rows.
- Browser uploads go to the standalone files service, which runs NO post-upload processing (aidream's `dispatch_on_upload` is absent there by design, S16) — so the Source input starts the one run itself when the server shows none. Other upload surfaces still rely on the scheduled sweep.
- `pnpm sync-types` is refused at the time of writing by an unrelated drop in the aidream checkout (ai-visibility `PanelTrend`), so `/sources/manifest|resolve` are typed from the shared package, not the generated file.
- "Wait for the clean version" is recorded on the draft; the host that runs the request must honour it (USI-5 onward).
- Pasted text and transcripts land without `clean_content` (the clean stage is skipped for them), so `/sources/manifest` reports them "processing" forever while the stage table says "cleaned". Server-side (source resolution) — the card shows both honestly until it is fixed.
- Parts are per form: changing the form clears the picked parts and says so.

---

## Change log

- 2026-09-28 — USI-3e: file Sources follow the server's state (`fileSource.ts` + test): text/markdown/PDF uploads land a Source (aidream: a person's run of an orchestrator-owned file goes through the file adapters and returns the Source id), a reused copy is kept at once, a reload mid-run re-attaches with no second job; attach targets send no edge label (the registry names it), file edges follow the registered direction, and the door files a Source for a deck the made-from way. Verified on the shared preview (own host) as admin@admin.com against a local aidream with the fixes.
- 2026-09-28 — USI-3b: never lose input (kept input + auto re-land after reload, "Try again", "Choose it again"; `interrupted.ts` + test), uploads filed `file → attachTo` via `associationsService` and their Source kept when reading makes one, the family chooser (`ResourceFamilyPolicyEditor`, shared with chat) speaks in outcomes (`resource-family-words.ts` + test; chat chip reads "Best · All", "What the AI reads"), a stable "Bringing back what you picked…" state replaces the false "Nothing picked yet." (server HTML carries no empty state), one card per Source, a kept web page drops the stale "not saved" notice, recovery logic in the UI-free `useSourceRecovery`, demo takes `?attach=<type>:<id>[:label]`. Verified on the shared preview as admin@admin.com (1024 and 375): paste and web page reloaded mid-land came back landed, one row each, kept and filed against the test project; a repeat paste returned the same Source; the upload's `file → project` edge shows on the file's Info tab.

- 2026-09-27 — Verified on the shared preview as admin@admin.com (desktop 1440, phone 375): paste → landed + kept; web page → landed; stored 240-page PDF → measured (359k), 3 of 73 parts picked, form switched to raw, review auto-opened above 100k; note picked; remove; reload keeps picks; max 3 enforced. YouTube reached the transcript route, which failed server-side (shown on the card).

- 2026-09-27 — Created (lane USI-3): `SourceInput`, `YourSources`, `SourceCard`, `sourceKinds.ts`, `useSourceSet`, `useSourceIntake`, `sourceSetApi.ts`, the dev demo; `instanceResources` gains block type `source_ref` + `setResourceSource`; knob `sources.review_threshold_chars` registered.
