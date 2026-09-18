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
| `contract-paths.ts` | 🚨 **Binds those shapes to `callApi`'s `paths` and DELETES ITSELF.** Interface merging refuses a duplicate key whose type differs, so the moment `pnpm sync-types` writes the real `/media` operations, `pnpm type-check` fails by name and this file goes. It is not a shim to live beside the generated types. |
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
3. **A reload mid-job loses nothing.** `useJob` reads `GET /media/jobs/{id}`
   BEFORE it attaches a stream, always. A panel that is only correct if it
   caught the stream is the defect this order exists to prevent.
4. **The Action bar is the server's.** `useActionRegistry` reads
   `GET /media/actions` and there is no fallback list anywhere. One declaration
   server-side is enough to appear; a retired one disappears. If the registry
   cannot be read, the bar says so and invents nothing.

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

## Doors in

From the Masterwork Sources panel and step 2 of the new-Rulebook flow
(`?from=rulebook&rulebook_id=…`, which the front door answers with one sentence
and a way back), and from `/transcripts` beside New.

## Verifying

```bash
pnpm type-check
npx jest features/source-library --no-coverage      # 11, three laws
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
