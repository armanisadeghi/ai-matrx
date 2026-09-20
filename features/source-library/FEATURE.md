# features/source-library — the Media Source Catalog (the SCREEN)

Paste a YouTube channel, `@handle`, playlist or any video link into one box and
the whole catalogue lists in seconds, split into long videos, Shorts and live,
with metrics, transcripts, and the server's Actions on any selection.

Arman, 2026-09-17: *"provide a youtube channel and have the system get a list of
all videos in seconds, then separate shorts from longs, provide metrics on
counts, dates, lengths… then transcribe and organize all, some… especially the
experience a human has and how quickly and easily we can do things."*

**Routes:** `/libraries` (front door) · `/libraries/[id]` (one Library).
**Settings:** `/user-settings/organizations/media-catalog`.
**Canonical nouns — only these three:** **Library** · **Source** · **Action**.

## The contract is the truth, and it lives in one place

`../../../common-docs/projects/media-source-catalog/API-CONTRACT.md` (version
`0.1.0`). The server lane owns it. This feature is its client half:

| File | What it is |
|---|---|
| `types.ts` | The contract's TypeScript face. Nothing here is invented. |
| ~~`contract-paths.ts`~~ | 🚨 **GONE, exactly as designed (2026-09-18).** It bound the contract's shapes to `callApi`'s `paths` while the server lane built, and it promised to delete itself the moment `pnpm sync-types` wrote the real `/media` operations. That happened: every key collided (TS2717), `pnpm type-check` failed by name, and the file was deleted in that session — along with `features/connected-sources/contract-paths.ts` and the `lib/api/contract-ahead-route.ts` wrapper both used. Paths and bodies now come from `types/python-generated/api-types.ts` and nothing else. |
| `api.ts` | Every call the screen makes, through the ONE door. |
| `format.ts` | Pure formatting, so one number is formatted once. |

**Frontend requests go at the bottom of that contract**, dated and signed, under
`## Frontend requests`. Three are open (a way to list a Library's jobs, a
reference from a finished job to what the Action produced, and where
`lane_counts` lives).

## Why the catalogue reads through the server and not Supabase

House rule is that rows go direct to Supabase. Here the row set behind a Library
is a join of `research.youtube_video` through `platform.associations`, ordered
and faceted by fields the contract computes, and the `media.*` schema plus its
scoped list RPC are the server lane's to create. §4.2 publishes `GET …/videos`
as *"the MOUNT READ — a client never depends on having caught the stream"*, so
that IS the declared read path. If the server lane publishes a list RPC instead,
one file moves: the service triple.

Transcript text is a genuine direct Supabase read (`transcriptService.ts`).

## The four things this screen promises

1. **The catalogue streams in.** `useLibrarySync` starts the one enumeration
   door (§4) and writes pages into the slice as they land. There is **no
   schedule and no schedule UI** — "Bring up to date" is a button a person
   presses, and the contract says the platform will never sync on a timer
   unless Arman turns that on himself.
2. **Nothing is spent before the numbers are on screen.** `useActionRunner`
   fetches `POST …/estimate` and awaits a decision in `ActionRunDialog` before
   `POST …/jobs` is called at all. The shell's own `confirm` is synchronous and
   therefore cannot carry an honest cost, which is the only reason this feature
   has a confirm of its own.
3. **A reload mid-job loses nothing, and a started job is always findable.**
   `LibraryPage` mounts by asking `GET /media/libraries/{id}/jobs` — the
   contract's own JOB-DISCOVERY DOOR — for everything still `pending` or
   `running`, and `useJob` then reads `GET /media/jobs/{id}` BEFORE it attaches
   a stream. A panel that is only correct if it caught the stream is the defect
   that order exists to prevent; a page that can only list jobs whose ids this
   browser happened to learn is the defect the mount read exists to prevent.
   This page used to keep job ids in `localStorage` because a comment here
   claimed the discovery endpoint did not exist. It always had. That mistake is
   what turned a `POST …/jobs` envelope mismatch into lost money on 2026-09-18:
   the id never arrived, so nothing was remembered, so a real running paid
   transcription was invisible on this screen while its rows sat in the
   database. The per-device store is gone — a second door that can be empty
   beside a door that cannot is not a fallback, it is the bug. Guard:
   `__tests__/a-started-job-is-always-findable.test.ts`.
4. **The Action bar is the server's.** `useActionRegistry` reads
   `GET /media/actions` and there is no fallback list anywhere. One declaration
   server-side is enough to appear; a retired one disappears. If the registry
   cannot be read, the bar says so and invents nothing.
5. **Every Source says what was last done to it** (contract §4.3). The **Last
   action** column shows one honest line — the runner's own sentence — under the
   Action's own label from that same registry, and a dash when nothing has run.
   The **Action** and **Result** chips narrow on the server (`action_key` /
   `action_status` on `GET …/videos`), so "the three that failed" is a real
   selection an Action can be re-run over, not a filtered view of one page. The
   header's **Actions run** tile counts each Source once by whatever ran on it
   most recently, and the row menu opens the job the outcome came from.
   ONE column and ONE tile, never one per Action: the registry grows, and a
   screen whose shape is a changelog of it is always one Action behind.
   Guard: `__tests__/an-action-leaves-a-mark.test.tsx`.

## 🚨 Two live-measured rules every reader here obeys

**THE ACTIVE ORGANIZATION IS PART OF WHAT A READ WAS BUILT FROM.** It resolves
*after* the first render (cookie → default preference → personal org, see
`lib/organizations/resolveActiveOrgContext.ts`), and `callApi` refuses every
request until it does with *"Select an organization before sending this
request."* A read fired once on mount therefore fails and never retries —
measured on the live page on 2026-09-17, on the Libraries list, the Library
page's mount reads, the Action registry and the settings tab, all four at once.
So the organization id is named as a dependency of every read, and it is part of
both list configs' `serviceKey` — exactly what `lib/entity-list/FEATURE.md`
§ service-key-refetch already said to do.

**A 404 IS A MISSING ENDPOINT, NEVER A PERMISSION REFUSAL.** The list shell
prints one of two empty states, and the refusal one says *"choose a tab you have
access to, or ask an administrator"* — a confident wrong answer when the truth
is that this server build does not carry these endpoints yet. Only 401/403 is
classified as a refusal; a 404 with no sentence of its own gets its own sentence
and a working Retry.

**NOTHING RENDERS A VALUE A PARSER DID NOT BUILD.** `api.ts` used to end every
call in `unwrap<T>()` — `return result.data as T`, a cast with no check — while
`JobPanel` renders `item.title`, `item.external_id` and `item.attempt` straight
into JSX. That is the shape of the 2026-09-17 `/exports` outage, where one
server key that changed from a count to a list took a whole route to the global
error boundary on every load. `contract.ts` now narrows every response and every
stream event, field by field, with the platform readers in
`lib/contract/narrow.ts`. A field the screen needs and cannot read raises a
`MediaContractError` — which IS a `MediaApiError`, so it lands in the banner and
beside the retry every surface here already has — a redundant number is derived
and the stand-in announces itself on screen (`LibraryPage` prints the metrics
ones), and a malformed STREAM event is dropped from the typed stream with its
sentence sent to `onProblem`, because a run this client cannot read is still
running on the server. Guard: `__tests__/unreadable-shapes.test.tsx`.

## Layout

| Path | What it is |
|---|---|
| `browse/` | The saved Libraries list (service + config). Four visibility lanes ARE the four list scopes. |
| `catalog/` | The Sources inside one Library (service + columns + config). Facet counts come from `GET …/metrics` over the SAME filter, so a chip never counts the 25 rows on screen. No scope tabs: the Library IS the scope. |
| `components/` | `CatalogPasteBox` · `LibrariesFrontDoor` · `LibraryPage` · `LibraryMetricsHeader` · `JobPanel` · `SourceDetailPanel` · `ActionRunDialog` · `RulebookParamPicker` |
| `hooks/` | `useLibrarySync` · `useJob` · `useActionRegistry` · `useActionRunner` |
| `vocabulary.ts` | 🚨 **What this Library's Sources are CALLED, and which axes exist for them.** The header used to print YouTube's words over everyone's counts — a podcast read "LONG VIDEOS 886", a blog read "UNCLASSIFIED 10,563". The words now come from the Library's adapter, a tile whose axis does not exist for that kind holds its space silently instead of printing a zero, and an adapter this file has never heard of gets NEUTRAL words, never YouTube's. |
| `redux/sourceLibrarySlice.ts` | The live half — a CACHE over the server's mount reads, never the truth, never persisted. |
| `settings/` | The server's knobs (§9), rendered entirely from the server's declaration. |
| `__tests__/three-laws.test.tsx` | The three guards, each with its RED mutation written down. |
| `__tests__/honest-on-the-real-wire.test.tsx` | The shapes the LIVE server sends (`caption_languages: null`, the `{"library": …}` envelope, the platform visibility enum, a partial jsonb `metrics` blob) and the paste box's keyboard. |
| `__tests__/not-yet-is-not-a-failure.test.tsx` | The organization resolves a beat after first render: no call is made without one, the transport's `organization_context_required` never becomes a sentence, and a read that started earlier can never overwrite the one on screen. |
| `__tests__/every-kind-speaks-its-own-words.test.tsx` | Every adapter `vocabulary.ts` declares, rendered — only YouTube may use YouTube's words. |
| `__tests__/library-table-reachable/` | Playwright gate (`pnpm test:library-table-reachable`), not a Jest suite — real Chromium layout over `EntityListPage`'s and `LibraryMetricsHeader`'s actual class strings, at 1440x900 and 390x844. Proves the episode table is reachable even when `LibraryMetricsHeader`'s stat tiles + charts are their tallest. |

## Doors in

From the Masterwork Sources panel and step 2 of the new-Rulebook flow
(`?from=rulebook&rulebook_id=…`, which the front door answers with one sentence
and a way back), and from `/transcripts` beside New.

## Verifying

```bash
pnpm type-check
npx jest features/source-library --no-coverage      # 12, three laws
pnpm test:library-table-reachable                   # real-Chromium layout, 1440x900 + 390x844
```

Live, signed in as `admin@admin.com` via `pnpm dev-login /libraries`. Screenshots
at 1440 and 390 in both themes live in
`../../../common-docs/projects/media-source-catalog/screen/`.

## THE VOCABULARY RULE

One Library primitive spans YouTube, podcasts, blogs, decks, mailboxes, calendars,
chats and folders. **Never hardcode a source-kind word in a component** — read it from
`sourceVocabulary(library)`. Two halves, and the second is the one that gets forgotten:
a better word must not drag an invented number behind it. The server's §5 metrics carry
no word count and the blog adapter sets no duration, so a blog has NO length axis and
those tiles are absent — not "0 min", not a skeleton. The slot keeps its height so
nothing moves; the claim is gone. The day the server publishes a word count,
`vocabulary.ts` is the only file that changes.

## Change log

- `2026-09-20` — Claude (Opus): **the dialogs' BODIES now speak the Library's
  own noun, and three things that could never be true are gone (jobs-bar
  cold-walk-13: N6 + Friction).** Walk 12 fixed the headers; walk 13 found
  "video" seven more times in the Send and Transcribe BODIES, all of it from
  sentences the server writes — the Action registry's descriptions, the
  estimate's cost basis, its warnings and its refusals. `GET /media/actions` is
  one global registry with no Library, so a noun baked there is baked wrong for
  everyone: the server now writes `{item}` / `{items}` /
  `{free_captions_source}` and `speakMediaNouns` (in `vocabulary.ts`, the same
  table the headers read) is the ONE place those become words. Every server
  sentence in `ActionRunDialog` and `JobPanel` goes through it — description,
  not-yet reason, refusal, cost basis, warnings, field labels and help text —
  and an unknown token is left intact rather than blanked, so a server ahead of
  this client is loud instead of quietly ungrammatical. Guard:
  `__tests__/a-podcast-is-never-told-it-is-a-video.test.tsx`, proven red on the
  unwrapped call sites. Alongside it: `vocabulary.ts` grew a `views` axis, so a
  podcast no longer renders a VIEWS column of dashes over 2,981 rows or a "Most
  watched" panel beside the cadence chart, and the `TYPE: Long` badge and the
  Type/Captions facets follow `kindSplit`/`transcribable` the way the metrics
  tiles already did — all four gated on `kindKnown`, because the neutral
  vocabulary means "the row has not arrived", never "this axis does not
  exist". The cadence chart got a real axis (first / middle / last month), a
  stated scale ("Peak N in a month" instead of a bare "117 months") and a bar
  floor tall enough to tell a month that published something from one that did
  not. And the second "Bring up to date" — the poorer of two identical buttons
  300px apart — is deleted; the metrics header's keeps the running state, the
  honest disabled reasons and the stale-numbers notice.

- `2026-09-20` — **D343 filed, not fixed: three of this surface's controls are
  decorative because the live endpoint takes neither of the parameters they
  send.** `GET /media/libraries` in aidream (`media_catalog.py`, `list_libraries`,
  read on `origin/main`) declares only `limit` and `offset`. `API-CONTRACT.md` §3
  publishes `visibility`, `adapter` and `q`, `browse/service.ts` sends two of
  them, and FastAPI drops an undeclared parameter without a word — 200, whole
  unfiltered list. So the search box does not narrow (measured on screen,
  `common-docs/projects/acquisition-frontier/acquisition-console/screens/v1/`),
  the four lane tabs serve the same rows, and D10's per-lane counts are four
  IDENTICAL totals rather than four zeros. It is the surviving sibling of the
  class aidream already closed on `GET /media/libraries/{id}/videos`. Nothing in
  this repo can close it: `urlState: true` here and a filtered link from the
  Acquisition Console both wait on the server half, because a `?q=` the
  destination cannot honour is a worse lie than no parameter. Exact server
  change in `FOUND_DEFECTS.md` D343; the two comments that asserted the
  parameters worked are corrected in place.

- `2026-09-20` — **D343 closed on both sides: the search box, the four lane
  tabs and the Acquisition Console's Library links are one query now.**
  `GET /media/libraries` published `visibility`, `adapter` and `q` in
  API-CONTRACT.md §3 and DECLARED none of them, so FastAPI dropped all three and
  answered 200 with the whole unfiltered list — the search box did not narrow,
  the four lanes served identical rows, and D10's per-lane counts were four
  IDENTICAL totals rather than four zeros. Server half: aidream `d7093434f6`
  (one `apply_library_filter`, an unknown value refused 400 with the accepted
  set named, `total` counting the filtered set; contract 0.6.0, and the
  `…/metrics` and `…/videos` siblings swept with it). This repo: `urlState:
  true` on `createLibraryListConfig` so `?q=`/`?scope=`/`?page=` survive a
  reload; `browse/service.ts` sends `adapter` from the shell's own `filters` bag
  and runs the lane counts under the SAME narrowing as the list (a tab reading
  "Mine 33" that becomes eleven rows when pressed is the tile-vs-list defect
  with the numbers swapped); `LibraryListQuery.adapter` widened to `string[]`
  deliberately, because the client's `MediaAdapter` union names ten adapters and
  the live shelf carries more — the server owns that vocabulary. §5's new
  `filtered` / `filtered_total` / `library_total` are read in `contract.ts` with
  ABSENT meaning unfiltered, never zero. The catalog's `fetchFacets` now asks
  UNNARROWED on purpose: with the server honouring filters, counting each
  dimension inside its own selection would drop every unpicked chip to zero and
  delete the section, leaving a person narrowed with no control to widen by.
  Guard proven failing-then-passing:
  `__tests__/the-libraries-link-is-a-query-the-list-runs.test.ts` — 11 cases
  walking console row → href → URL → reader → wire; 8 go red against the
  pre-fix behaviour.
- `2026-09-20` — **Four defects from the twelfth cold walk (D6, D6b, D10, D11),
  fixed and guarded.** D6: the Sources table used to render its empty state
  from the very first (pre-sync) row read and never re-asked when
  `library.sync.completed` landed rows — `serviceKey` (`catalog/listConfig.tsx`)
  now folds in `LibraryPage`'s `listGeneration`, the real fix, plus a
  belt-and-suspenders `emptyState` override so "Nothing catalogued yet" can
  never render while the sync banner (`sync.listed`) is reporting rows for this
  Library. D6b: podcast episodes were called "videos" throughout ("Transcribe 3
  videos", "Free, from YouTube's own captions" on a podcast job) — every
  hardcoded "video(s)" in the feature (bulk-selection noun, confirm dialog,
  job names/toasts, the job panel's lane sentences and item fallback text, the
  Source detail panel, the transcript service's error sentences, the Sources
  table's caption/transcript cells) now reads `sourceVocabulary(library)`,
  which grew a `freeCaptionsSource` field for the free-lane sentence; two
  Action `params_schema` entries (`aidream/services/media_catalog/actions.py`)
  also grew `title`s the same way `agent_id` already had. Guarded by a static
  census test that fails on any hardcoded "video(s)" outside `vocabulary.ts`'s
  YouTube entry (`__tests__/d6b-no-hardcoded-video-outside-vocabulary.test.ts`).
  D10: the four visibility-lane counters (Mine/My Orgs/Shared/Public) always
  read `0` because they trusted `lane_counts`, one of this contract's three
  OPEN "Frontend requests" that no server build has ever sent —
  `browse/service.ts`'s `fetchCounts` now derives every lane's count the same
  way `fetchPage` counts rows: one `listLibraries({ visibility: [lane] })` call
  per lane, reading `.total`. Guarded, failing-then-passing, in
  `__tests__/d10-lane-counts-not-derived-from-nothing.test.ts`. D11: the send
  dialog's parameter labels and gate sentence spelled out the raw
  `rulebook_id`/`collection_id` keys ("Rulebook id", "needs rulebook id before
  it can start") — `send_to_rulebook`'s and `build_knowledge_base`'s
  `params_schema`s now carry `title`s (server), and `ActionRunDialog`'s missing-
  param sentence and Start-button casing were fixed to read them as a person
  would say them, following the same pattern the bridge lane used for
  `agent_id` ("Which agent") in aidream `82dd7c48c5`. Full walk:
  `common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/cold-walk-12/README.md`.

- `2026-09-19` — **The Library episode table is reachable again at 1440x900**
  (D4, cold-walk-12). `LibraryMetricsHeader`'s stat tiles plus its two fixed
  `h-[276px]` charts could consume nearly the whole viewport inside
  `EntityListPage`'s static `notice` zone, squeezing the table's `flex-1
  min-h-0` scroll body down to a sliver with no genuinely scrollable
  ancestor — 24px of row 1 visible, rows 2-25 gone, mouse-wheel scrolling
  doing nothing. Fixed in the SHARED PRIMITIVE
  (`lib/entity-list/components/EntityListPage.tsx`), not here: `notice` now
  renders inside its own `max-h-[42vh] overflow-y-auto` (scrolls on its own,
  however tall its content), and the table's scroll body is floored at
  `min-h-[16rem]` instead of `min-h-0` (still shrinks, so its own scroll
  still engages, but never below a workable slice of table). Every other
  `EntityListPage` notice (assist strips, paste boxes) is far under the cap,
  so nothing about them changes. Guard: `__tests__/library-table-reachable/`
  (`pnpm test:library-table-reachable`), proven RED against the pre-fix
  classes and GREEN against the current ones, at both 1440x900 and 390x844.

- `2026-09-19` — **A Source can finally say what was done to it, for every
  Action and not just `transcribe`.** Until today the only per-item outcome on
  this screen was the Transcript column. Six other Actions ran over the same
  Sources and wrote nothing back, so a person who selected fifty Sources, sent
  them to a Masterwork Rulebook, read "41 succeeded, 6 skipped, 3 failed" on a
  job panel and closed it could never again learn which forty-one went, which
  six had no words, or which three broke — this list looked exactly as it had
  before they clicked. The server now projects one outcome per Action onto the
  Source (contract §4.3), and this module reads it: `ActionOutcome` in
  `types.ts`, `parseActionOutcome`/`parseActionOutcomes` in `contract.ts` (both
  new fields NULLABLE on the wire — an older server sends neither and its
  Sources must still list), `lastActionColumn` in `catalog/columns.tsx`, the
  Action/Result chips in `catalog/service.ts` + `catalog/listConfig.tsx`, and
  the "Actions run" tile in `LibraryMetricsHeader`. `transcript_status` is now a
  view of the same projection server-side and is otherwise untouched here.
  A malformed outcome costs the NOTE, never the Source, and a badge never
  renders without its sentence. Guard:
  `__tests__/an-action-leaves-a-mark.test.tsx`, mutation-proved red on both the
  sentence rule and the filters before green.

- `2026-09-18` — **The generated contract arrived, and four calls turned out to
  be calling nothing.** `pnpm sync-types:live` wrote the real `/media/*`
  operations into `types/python-generated/api-types.ts`, `contract-paths.ts`
  collided on every key and was deleted exactly as its header promised, and the
  truth underneath it was that this module named four endpoints the server never
  built — each one marked `implemented: False` in
  `aidream/tests/test_media_catalog_wire_shapes.py` and listed in
  API-CONTRACT.md §0.5's "NOT working" table: `PATCH` and `DELETE
  /media/libraries/{id}`, `POST …/classify`, and `GET /media/jobs/{id}/stream`.
  `updateLibrary`, `deleteLibrary`, `classifyLibrary` and `streamJob` are gone
  rather than left calling 404s — the same class §0.5 records for the Cancel
  button. What a person could actually see change: **"Remove this Library" is no
  longer in the row menu** (it asked for confirmation and then showed an error
  toast, every time), and **job progress now re-reads the durable rows every two
  seconds** instead of attaching to a stream that never existed and then sitting
  frozen. Two body fields the server never read went with them: `sync_now` on
  create (`CreateLibraryBody` has no such key) and `stream` in the sync body
  (`SyncBody` is `{ mode, classify }`; that endpoint always streams). The server
  gap is filed in `FOUND_DEFECTS.md`.

- `2026-09-18` — **A job that started is a job this screen can find.** Two
  independent failures, both fixed. (1) `POST …/jobs` answered `{"job": {…}}`
  where §7.3 publishes a bare Job row, so `job.id` was `undefined` on a job the
  server had already accepted, started and billed — the screen refused honestly
  and the person's $2.19 became untrackable. The server now sends the bare row
  (guarded there by a test that walks EVERY documented endpoint against the
  router); `asJobRow` reads either shape anyway, because a client and a server
  deploy minutes apart. (2) The real defect: this page had never called
  `GET /media/libraries/{id}/jobs`, the contract's job-discovery door, and kept
  ids in `localStorage` instead. It is now the Library page's mount read, and
  the per-device store is deleted. A failure to list is a sentence on screen
  with a retry, never an empty space that reads as "nothing is running".
  Guard: `__tests__/a-started-job-is-always-findable.test.ts`, proven red
  against the envelope with the exact sentence the live test screenshotted.

- `2026-09-18` — **An estimate no longer fails on an unrelated, absent YouTube
  quota snapshot.** Pricing a selection reads already-catalogued Sources and does
  not call the YouTube Data API; production therefore correctly omits `quota`.
  The client now treats only that absent snapshot as optional while continuing to
  reject malformed quota objects and every price, count, expiry, and token field.
  Guard: `three-laws.test.tsx` parses the production-shaped estimate before a
  confirmation can be offered.

- `2026-09-18` — **The header speaks the Library's own words, and a not-yet stops
  looking like a failure.** New `vocabulary.ts` picks the nouns and the axes from
  the Library's adapter: a podcast is counted in Episodes with a Total listening
  time, a blog in Posts with no length axis at all, decks/messages/events/files/
  conversations each get their own noun, and an unknown adapter gets neutral words
  rather than YouTube's — a tile whose axis does not exist holds its space silently
  instead of printing a zero. `types.ts` caught up with the server's adapter list
  (`blog_feed`, `slide_deck` and the five connected-account adapters were missing).
  Separately, the metrics/library reads no longer fire before the active
  organization resolves, the transport's `organization_context_required` is
  recognised as a not-yet instead of being recorded as "Select an organization
  before sending this request", both entity-list services say "Still opening your
  workspace" and stay retryable, and every metrics read takes a ticket so a stale
  answer cannot overwrite the one on screen. Guards:
  `not-yet-is-not-a-failure.test.tsx` and `every-kind-speaks-its-own-words.test.tsx`.

- `2026-09-17` — **Every response narrowed; the `unwrap<T>()` cast is gone.**
  Added `contract.ts` (the parsers + `MediaApiError`/`MediaContractError`) on
  the extracted platform kit `lib/contract/narrow.ts`, wired every exported
  function in `api.ts` through a parser, gave `asSyncEvent`/`asJobEvent` real
  event bodies and an `onProblem` channel (surfaced by the sync strip and the
  job panel), and made `getLibraryMetrics` return `Parsed` so a recovered number
  says so on screen. Guard `__tests__/unreadable-shapes.test.tsx`, proven
  failing on the pre-fix `api.ts`.

- `2026-09-17` — **Built, against the contract published before its server
  half.** Front door, Library page, Sources list with bulk selection, the
  estimate confirm, the job panel, the Action registry bar, the transcript
  panel, the settings tab, and the doors in. Three guards proven failing then
  passing. Two defects found by driving the real page and fixed as classes (the
  organization dependency and the 404 classification). **Not yet verified
  end-to-end against a real channel: the server half of the contract was not
  deployed when this was built — every `/media/*` endpoint answered 404 — so
  what is proven live is that every screen renders, and that every unavailable
  state says what is wrong and offers a way on.**
