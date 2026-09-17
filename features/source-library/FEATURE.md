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

## Layout

| Path | What it is |
|---|---|
| `browse/` | The saved Libraries list (service + config). Four visibility lanes ARE the four list scopes. |
| `catalog/` | The Sources inside one Library (service + columns + config). Facet counts come from `GET …/metrics` over the SAME filter, so a chip never counts the 25 rows on screen. No scope tabs: the Library IS the scope. |
| `components/` | `CatalogPasteBox` · `LibrariesFrontDoor` · `LibraryPage` · `LibraryMetricsHeader` · `JobPanel` · `SourceDetailPanel` · `ActionRunDialog` · `RulebookParamPicker` |
| `hooks/` | `useLibrarySync` · `useJob` · `useActionRegistry` · `useActionRunner` |
| `redux/sourceLibrarySlice.ts` | The live half — a CACHE over the server's mount reads, never the truth, never persisted. |
| `settings/` | The server's knobs (§9), rendered entirely from the server's declaration. |
| `__tests__/three-laws.test.tsx` | The three guards, each with its RED mutation written down. |

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

## Change log

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
