# FEATURE.md — `source-input` (the one Source input)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-29`

---

## Purpose

ONE input for everything a person hands the AI to work from — their stored Sources, files, notes, records, and new material (pasted text, a web page, a YouTube video, a recording, an image) — plus "Just a topic". Every tool that builds a request from a person's Sources (Flashcards first, then all of Education, mandates, agents, workflows) renders this component and sends what it produces: a `source_set` of pointers, never blobs.

Campaign of record (design, frozen contract, register): common-docs `projects/unified-source-input/` — `DESIGN.md`, `REGISTER.md`. This file is only the local mechanics.

---

## Entry points

**Component**
- `components/SourceInput.tsx` — `<SourceInput surfaceKey kinds? max? required? defaultForm? title? attachTo? purpose? targetModelId? deliveries?>`. `deliveries` = what the HOST can use (omitted = both); flashcards pass `["direct"]`. The screen (A3-F, only certified canonical primitives): one search box "Search everything you have" + a `SegmentedControl` Mine | <active org> (a FILTER, never permission; absent with no active org); "Add new" — Upload · Paste text · Web page · YouTube · Recording · Image · Topic (icon + one word, no helper line); "Use existing" (below); picked Sources as cards. `kinds` narrows the Add new tiles and `"existing"` switches the search + Use existing row. Configuration is by props only — never fork it. A review this input opened is cancelled when it unmounts (`cancelSourceReview`).
- `components/UseExisting.tsx` — "Use existing" on the org resource inventory primitives (lane A5-P): kind chips from `useKindCounts(scope)` (the registry's `source_input_pickable` kinds — file, note, transcript, udt_document, dataset, workbook, and `processed_document` = "Saved sources": the person's saved pasted text, web pages, captions and recordings, one row per Source, never a file's or transcript row's text, which are picked as that File / Transcript; plural name + count; a zero kind is absent, an uncountable one shows "—"); opening one lists it with `useKindItems(kind, scope, query)` (server-searched, recent first, `resources.inventory/page_size` per page, Show more). With words in the search box every kind shows its first 5 matches (Show more), and "No matches" once all have answered empty. Picking goes through `useSourceIntake().addExisting`. A Saved source row carries the Knowledge hub's Stage word as a badge (`itemStage.ts`: `HUB_STAGE_LABEL` from `readSourceFacts`; only indexing rows are re-read, on `factsPollDelayMs`).
- `components/SourceCard.tsx` — one Source: name (opens it — `EntityRef`, new tab), kind, size, state, "Use: <form> ▾" (Which version — the forms the server measured, for every kind incl. stored files — and How the AI gets it), "Choose parts" (each part with its opening words), remove, processing line with "Wait for the clean version".

**Hooks**
- `useSourceSet(surfaceKey, { defaultForm?, organizationId? })` — THE client handler. `sources`, `topic/setTopic`, `addReady/addPending/settle/fail/remove`, `updateRef` (form, parts, cap, delivery), `setWaitForClean`, `toSourceSet()`, `applySourceSet()` (from the review page), `manifest()`, `resolve()`, `totalChars`, `manifestError`, `settled`, and (USI-3b, additive) `restoring` (the saved draft is not read back yet — show a loading state, never "nothing picked"), `restart(id)`, `updateDraft(id, patch)`. Landing the same Source twice keeps ONE card and says so on it. A host that needs the payload calls `useSourceSet` with the SAME `surfaceKey` it gave `<SourceInput>`.
- `useSourceIntake(set, { attachTo })` — every way new material becomes a Source, through the existing doors (below). Entry points: `addPastedText`, `addScrapedPage` (the web picker's landed Source; edited text lands as a paste), `addWebPage` (a link re-scraped after a reload), `addYouTube`, `addUploaded` / `addUploadedRecording` (files `InlineUploadArea` already uploaded), `addExisting` (a registry item), `resume(card)`, `retryFile(card, uploadedFile)`, `fileLanded(card, processedDocumentId)`. A landing that needs an organization and has none fails the card with `WAITING_FOR_ORGANIZATION` — no in-memory queue.
- `useSourceRecovery(set, intake, runner, { organizationId })` — the moment an organization is known, every card waiting for one is landed again from STATE (`WAITING_FOR_ORGANIZATION` → `resume`; a read Source whose keep waited, note `KEEP_WAITING_FOR_ORGANIZATION` → `fileLanded`), so it also survives a reload (A3-F replaced the `organizationHold.ts` queue). A stored-file card is asked about only when an organization is known (the file's own via `fileOrganizationId`, or the picked one); otherwise `fileCardHeldForOrganization` holds it (card: "Waiting for an organization" + Choose organization) and nothing polls. UI-free: re-lands what a reload cut off (once per card, module-scope guard) and, for every stored-file card without a Source, reads the SERVER's state (`fileSource.ts`: `/files/{id}/rag-status` → keep / wait / start the one run / unreadable) — so a new upload, a reused copy, a picked file and a reload all end the same way, and a live run is never duplicated. Any UI on this core calls it once.
- `interrupted.ts` — THE decision for a card cut off mid-landing (`reloadedCard`): resume from the kept input, re-offer a file whose bytes were lost (keeps its name), or the plain remedy; and the card sentences `WAITING_FOR_ORGANIZATION`, `KEEP_WAITING_FOR_ORGANIZATION`, `NOT_KEPT_FOR_RELOAD`.

**The core lives in `@ai-matrx/agents` (USI-7, "one core, many screens")** — `./sources/runtime` (pure: reducers + selectors, `createSourceSetController`, `createSourceIntake`, recovery, THE planner `planSourceReview`, the doors client, `delivery` / `partsSearch` / `interrupted` / `fileSource`) and `./sources/react` (`useSourceSet(adapter)`, `useSourceIntake`, `useSourceRecovery`, `useSourcePartsSearch`). The files below are this app's BINDINGS only: `useSourceSet.ts` (`reduxSourceSetAdapter`: cards in `instanceResources`, draft in `wizardDraft`), `useSourceIntake.ts` (the doors: sourcesApi, scraper, YouTube reader, transcription, associations service, organization gate, `addFailureSentence`, knob), `useSourceRecovery.ts` (`fetchFileRagStatus` + `fileOrganizationId`), `sourceSetApi.ts` (`sourcesClient` over typed `apiPost`; `useSourcePartsSearch(ref, query)`). Never re-declare a rule here — change it in the package (THE SAME-SESSION LAW). Former pure modules, now in the package:
- `delivery.ts` — THE one source of truth for how the AI gets a Source (`sourceDelivery`, `deliveryPatch`, `DELIVERY_WORDS`/`DELIVERY_CHOICES`); the card, the review row and the planner all read it.
- `partsSearch.ts` — THE one part matcher (a page, a range, or words against label + A5 `preview` locally, plus the ids the server found); `useSourcePartsText.ts` `useSourcePartsSearch(ref, query)` asks `POST /sources/parts/search` (words only, debounced, capped by `sources.parts_search_max_results`) — the whole Source text never comes to the browser.

**Registry**
- `sourceKinds.ts` — THE Add new tile list (label, icon, `noun`, `accept`); no helper lines (R9). `sourceKindNoun` / `sourceKindIcon` name a picked Source by its tile or its registry kind; `draftKindForToken` maps a registry token to a draft kind.

**API endpoints (aidream, called directly)**
- `POST /sources/manifest` / `POST /sources/resolve` / `POST /sources/parts/search` — `sourcesClient` (`sourceSetApi.ts`: the package's `createSourcesClient` over typed `apiPost` / `api-types.ts`), sent as `bodyCarriedRead` (the server admits both without a selected organization); wire types from `@ai-matrx/agents/sources` (frozen v1 + amendments; A5 `segments[].preview`).
- `POST /sources/land`, `POST /sources/{id}/keep` — via `features/sources/api/sourcesApi.ts`.
- Scraper quick-scrape (lands at its result boundary) — through `WebpageResourcePickerCore` (its `onSelect` second argument carries the landed `processedDocumentId`), or `useScraperApi().scrapeUrl` when a link is re-landed after a reload.
- `POST /media/youtube/transcript`, `POST /audio/transcribe-file` — Start's readers, then landed.

**Redux**
- `instanceResources` (extended, no new slice): key `source-input:<surfaceKey>`; block type `source_ref`; `source` = `SourceDraft`, `preview` = the manifest entry; reducer `setResourceSource` added for pointer changes.
- `wizardDraft` (the generic persisted-draft primitive): wizardId `source-input:<surfaceKey>` holds `{ sources, topic }` — written on every change, restored on mount. Never lose input: a Source still landing keeps what the person handed over in `SourceDraft.input` (pasted text up to the `sources.max_kept_draft_chars` knob — larger or unreadable: not kept, the card says so, a link, an uploaded recording's file id — never bytes) until it settles. After a reload it is landed again by itself (the door dedupes by content hash, so it is the same Source); a failed one offers "Try again"; a file cut off mid-upload says it did not arrive, keeps its name, and offers "Choose it again".

**Knob**
- `sources.max_kept_draft_chars` (default 2,000,000) — largest pasted text kept in the draft for a reload.
- `resources.inventory/page_size` (A5-P, default 50) — rows per Use existing page.
- `sources.review_threshold_chars` (default 100,000; organizations and people may override) — above it, "Review what goes in" opens by itself once per crossing.

---

## How new material lands (DESIGN.md amendment A3)

| Tile | Door | Pointer |
|---|---|---|
| Paste text | `buildPastedTextLanding` → `POST /sources/land` (kept, filed against `attachTo`) | `processed_document` |
| Web page | `WebpageResourcePickerCore` (scrape, preview, confirm) → the landed Source → `keep` against `attachTo` | `processed_document` |
| Upload / Image | `InlineUploadArea` (the canonical upload surface: compression, folder drops, Google import, `accept`) through the one upload choke point; filed at once through `associationsService` in the direction the package registry registers (`isRegisteredPair` from `@ai-matrx/associations`) (`fc_set → file`, `file → task`); then `useSourceRecovery` reads the server's state and starts the one run (`runForCldFile` → the orchestrator's file adapters, which land the Source) only when nothing is reading it; the Source is kept + filed through `keepSource` | `file` |
| YouTube | `YouTubeResourcePicker` → `fetchYouTubeTranscript` → `POST /sources/land` (identity `youtube:<id>`) | `processed_document` |
| Recording | `InlineUploadArea` (`audio/*,video/*`) → `transcribeCloudFile` → `POST /sources/land` (identity `audio-transcript:<fileId>`) | `processed_document` |
| Use existing / search | `useKindItems` row → `addExisting` | the registry token |

## Review what goes in

`openSourceReview(sourceSet, options)` from `review/` (lane USI-4 owns that folder). The header link is always there; the input opens it itself above the knob. An `applied` or `add_more` outcome is written back with `applySourceSet`.

---

## Demo

- `app/(dev)/demos/source-input/page.dev.tsx` — three configurations (every kind; no images, max 3; one required Source) and, under each, the `source_set` the host would send and a "Get the grounded text" button (`resolve()`).

---

## Known gaps (named, not silent)

- YouTube and recordings have no landing door of their own; the transcript is read client-side and landed. Tracked in DESIGN.md A3 as fallback rows.
- Browser uploads go to the standalone files service, which runs NO post-upload processing (aidream's `dispatch_on_upload` is absent there by design, S16) — so the Source input starts the one run itself when the server shows none. Other upload surfaces still rely on the scheduled sweep.
- "Wait for the clean version" is recorded on the draft; the host that runs the request must honour it (USI-5 onward).
- Pasted text and transcripts land without `clean_content` (the clean stage is skipped for them), so `/sources/manifest` reports them "processing" forever while the stage table says "cleaned". Server-side (source resolution) — the card shows both honestly until it is fixed.
- Parts are per form: changing the form clears the picked parts and says so.

---

## Change log

- 2026-09-29 — USI-7 (one core, many screens): the UI-free core moved to `@ai-matrx/agents` 0.18.0 `./sources/runtime` + `./sources/react`; this folder keeps the screens (Studio grid, review — certified primitives unchanged) and four bindings. Deleted here: `delivery.ts`, `partsSearch.ts`, `interrupted.ts`, `fileSource.ts`, `useSourcePartsText.ts`, `review/plan.ts` and their tests (ported to the package, plus an end-to-end runtime test over fake adapters). New here: `reduxBinding.test.ts` (the real runtime through the real Redux adapter), `deliveryWords.test.ts` (card + review take delivery words from the package). `useSourceSet` gains `deliveries` / `max` (host config → `fitDeliveries()` / `roomLeft()`).

- 2026-09-29 — V3-C (verify-3 copy + panels; R9): Recording records in place (`AudioResourcePicker`/Voice Pad; transcript lands as text named "Recording <time>"; "Upload a recording" keeps the file path); Image = `InlineUploadArea` with `imageLinks` (upload or an image link, `resource-picker/imageLink.ts`); the card's "Choose parts" is the review's `SourcePartsPicker` (one part picker, "Search parts"); review sizes in characters + pages (`pagesPhrase` in `lib/tokens/estimate.ts`), tokens only in a tooltip; helper lines cut (version, size limit) or 2–3 words (delivery: "Sent in full" / "Read as needed", hidden when there is one choice); phone: version switch → Select, footer one row ("Add more"); no active organization → one "Choose organization" ask in Use existing instead of the same error under every kind; unreadable file → one line with the remedy.

- 2026-09-29 — A3-F follow-ups: `pnpm sync-types` unblocked at its source — the `visibility` drop is T-13's deliberate retirement (aidream `d6c6247cc1`/`1bc217ac08`), recorded in `scripts/typegen-drop-allowlist.json`; `api-types.ts` is now generator output (`check:api-types-fresh` green) and `features/files/media-client/client.ts` speaks `publishedToWeb`. Use existing offers "Saved sources" (`processed_document` flagged pickable; `platform._inventory_filter` narrows it for counts and lists alike — migration `resource_inventory_lists_saved_sources.sql`) and shows the hub's Stage badge per row (`itemStage.ts` + test, red → green).

- 2026-09-29 — A3-F (canonical-primitive audit, frontend rows; R9 copy law; R10): hand-rolled drop zone + hidden file input → `InlineUploadArea` (extended with `accept`; Upload, Image, Recording, and the card's "choose it again"); web page / YouTube forms → `WebpageResourcePickerCore` (extended: `onSelect` hands over the landed Source) / `YouTubeResourcePicker`; pill groups → `SegmentedControl` (card delivery + form choosers, Mine | Org, Create deck's Make/Import); `organizationHold.ts` queue deleted → state replay in `useSourceRecovery` + `ensureOrganizationContext` (tests red 2 → green 4); `platform.association_types` client read → `isRegisteredPair` (`@ai-matrx/associations` 0.13.22, aidream `02fcbe0993`); `sourceSetApi` → typed `apiPost`, `review/api.ts` deleted; `useSourcePartsText` whole-text download → `POST /sources/parts/search` (aidream `6d70737697`); `YourSources` + the Files/A note/Documents & tables tiles → `UseExisting` on `useKindCounts`/`useKindItems`; 2,000,000 → knob `sources.max_kept_draft_chars` (knob `sources.your_sources_initial_rows` archived); review closes when the input unmounts (`cancelSourceReview`); every `helper` / `fallbackNote` sentence deleted, review header cut to one value line. Flashcards' 50-card max → knob `flashcards.max_cards_per_run`; `surfaceOwnedConversations` Set → Redux launch flag `surfaceOwnsOutput`; Add more cards → plain Dialog (canvas / flashcards FEATURE.md).

- 2026-09-29 — V2-F (verify-2 defects): (1) host deliveries — `SourceInputProps.deliveries` / `SourceReviewOptions.deliveries`; `delivery.ts` `allowedDeliveries`/`deliveryChoicesFor`/`fitDelivery`/`deliverySwitchedNote`; card, review row and the review's "look them up instead" offer only what the host can use; a Source set otherwise is switched back, said on the card and in the review (test `review/hostDeliveries.test.tsx`, red→green). (3) no organization: `fileCardHeldForOrganization` — no `/files/{id}/rag-status` poll until an organization is known (test `recoveryOrganization.test.tsx`, red→green; live: 0 calls in 20 s, held line shown). (4) "Your sources" defaults to Kept by you + Show filter + knob `sources.your_sources_initial_rows`. (5) one kind noun per Source (`sourceKinds.ts` `noun` + `sourceKindNoun`, `SourceDraft.sourceKind` for reused Sources) on the card and the review (`describe`), and `useSourceSet().resolve()` names every resolved Source as its card did (`withDisplayNames`, test `displayNames.test.ts`).
- 2026-09-28 — V1-A (verifier round 1): (1) the card's delivery wording came from chat's `ResourceFamilyPolicyEditor` ("nothing copied, looked up" + promote/exclude the Source path never reads) while the request carried the text — the card now uses the server-measured forms for every kind plus a delivery control, all delivery words from `delivery.ts` (card, review row, planner); (2) no organization selected: manifest/resolve go as organization-free reads, and every intake landing that needs an organization asks (click intent carried) or is held and replayed when one is set (`organizationHold.ts`; a held card resumes after reload); (3) the review window acknowledges its Dialog surface to the silent-render watchdog (no false "didn't appear" toast); (4) parts show their opening words (A5) and search finds words inside parts; multi-page parts read "Pages 22–24" (aidream `bbd33a0e1d`). Tests fail→pass: `delivery`, `partsSearch`, `sourceSetApi`, `review/SourceReviewWindow`; new `organizationHold`.

- 2026-09-28 — USI-3e: file Sources follow the server's state (`fileSource.ts` + test): text/markdown/PDF uploads land a Source (aidream: a person's run of an orchestrator-owned file goes through the file adapters and returns the Source id), a reused copy is kept at once, a reload mid-run re-attaches with no second job; attach targets send no edge label (the registry names it), file edges follow the registered direction, and the door files a Source for a deck the made-from way. Verified on the shared preview (own host) as admin@admin.com against a local aidream with the fixes.
- 2026-09-28 — USI-3b: never lose input (kept input + auto re-land after reload, "Try again", "Choose it again"; `interrupted.ts` + test), uploads filed `file → attachTo` via `associationsService` and their Source kept when reading makes one, the family chooser (`ResourceFamilyPolicyEditor`, shared with chat) speaks in outcomes (`resource-family-words.ts` + test; chat chip reads "Best · All", "What the AI reads"), a stable "Bringing back what you picked…" state replaces the false "Nothing picked yet." (server HTML carries no empty state), one card per Source, a kept web page drops the stale "not saved" notice, recovery logic in the UI-free `useSourceRecovery`, demo takes `?attach=<type>:<id>[:label]`. Verified on the shared preview as admin@admin.com (1024 and 375): paste and web page reloaded mid-land came back landed, one row each, kept and filed against the test project; a repeat paste returned the same Source; the upload's `file → project` edge shows on the file's Info tab.

- 2026-09-27 — Verified on the shared preview as admin@admin.com (desktop 1440, phone 375): paste → landed + kept; web page → landed; stored 240-page PDF → measured (359k), 3 of 73 parts picked, form switched to raw, review auto-opened above 100k; note picked; remove; reload keeps picks; max 3 enforced. YouTube reached the transcript route, which failed server-side (shown on the card).

- 2026-09-27 — Created (lane USI-3): `SourceInput`, `YourSources`, `SourceCard`, `sourceKinds.ts`, `useSourceSet`, `useSourceIntake`, `sourceSetApi.ts`, the dev demo; `instanceResources` gains block type `source_ref` + `setResourceSource`; knob `sources.review_threshold_chars` registered.
