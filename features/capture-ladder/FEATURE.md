# capture-ladder — the frontend's half of the four-rung capture ladder

**Canonical contract:** `common-docs/projects/acquisition-frontier/extension-ladder/CONTRACT.md`
(§8 is this repo's scope). That file is the shape; this file is what is actually
here, and where it stops.

## What it is

A page the platform cannot read is not a dead row. The ladder says who tries next:

| # | rung | who runs it | where |
|---|---|---|---|
| 1 | `http` | server | the scraper |
| 2 | `browser` | server | pooled Playwright |
| 3 | `own_browser` | the person's own Chrome, unattended | matrx-extend |
| 4 | `human_drive` | the person, driving | matrx-extend |

**The ladder law: never silently skip a rung.** A capture moves from rung *n* to
rung *n+1*, or it STOPS with a visible reason. It never jumps. The person is
asked LAST.

## The files

| file | what it is |
|---|---|
| `types.ts` | The closed vocabulary — rungs, statuses, stop causes — the `media.capture_handoff` row type, and `assertNoSkippedRung`, the ladder law as a client-side guard. |
| `captureHandoffTable.ts` | THE ONE READ of `media.capture_handoff`: supabase-js, org-scoped, Zod-parsed at ingress. Nothing here writes. |
| `useNeedsYou.ts` | "How many pages are waiting for a person right now?" — the reader behind the producer and `/capture/needs-you`, plus the honest `liveness` answer. |
| `needsYouAssist.ts` | THE PRODUCER. Keeps ONE `platform.assists` row per workspace in step with the queue — emitted, refreshed, and RESOLVED when the queue empties. Urgent band, `open_in_own_browser` action. |
| `NeedsYouAssistProducer.tsx` | Headless. Mounted in `app/DeferredSingletonCore.tsx`; runs the producer against the live queue. Renders nothing, ever. |
| `NeedsYouList.tsx` | The list body for the full page. One frame, divided rows, at most two lines each. |
| `NeedsYouPage.tsx` | `/capture/needs-you`, the full list plus the one primary button. |
| `route.ts` | `NEEDS_YOU_ROUTE`, alone, so naming the route costs nobody a component import. |

🚨 **There is no tray.** `NeedsYouTray.tsx` was deleted on 2026-09-18. It was a second floating
thing in the corner the assists dock already owns, and it had none of the dock's controls — no
instant close, no snooze, no dismiss-for-good, no action button. The notice is an assist; the
dock shows it. Do not add another one. Owner ruling and the full reasoning:
`common-docs/projects/acquisition-frontier/extension-ladder/STATE.md` §8.
| `ladderOutcome.ts` | Reading the ladder off a scrape result, wording it, and THE selection rule for "send the rest to my browser". |
| `sendToOwnBrowser.ts` | The ONE write: `POST /capture/handoffs` through `lib/python-client.ts`. |

The hand-off to the person's own Chrome lives one layer out, in
`lib/extension-bridge/handToOwnBrowser.ts`, because talking to the extension is bridge reach and
not a capture concept. It carries the WORKSPACE: the extension resolves its own active
organization independently of this app, and a hand-off that does not name one lands in a queue
the person never sees (the 2026-09-18 defect).

Consumed by `features/scraper/batch/BatchScrapePage.tsx` (the **Rung** column and
the **Send the rest to my browser** action) and by
`features/scraper/hooks/useScraperApi.ts`, which carries `ScraperResult.ladder`.

## The three invariants this feature exists to hold

1. **Reads go direct to Postgres; writes go through aidream.** There is no
   outbound channel from aidream to a browser extension
   (`common-docs/systems/clients/extension/CHANNELS.md` §2), so the queue has to
   be a durable row both clients read for themselves. Writes deliberately do NOT
   take that shortcut: `POST /capture/handoffs` is where the ladder law, the
   per-rung knobs and the Library landing are enforced, and a client insert
   would be a second door past all three.

2. **The client never infers the next rung.** `stoppedAtOwnBrowser` asks the
   server (`next_rung === "own_browser"`) and nothing else. Not "it failed", not
   "that looks like a login wall". Inferring on the client is how a rung gets
   skipped — and a 404 is a 404 in anybody's browser.

3. **Absent or honest, never dead.** The tray renders NOTHING at zero — no
   greyed "0 waiting" pill. The exception is the failure states, where silence
   IS the lie: a queue we could not read says so on the chip.

## The honest state of this half

| thing | state (2026-09-17) |
|---|---|
| `media.capture_handoff` | **LIVE.** Verified column-for-column against `information_schema.columns` on project `brsgrqvjdzwihsvnfqkf`. |
| `media` in `pnpm db-types` | **NO.** Which is why `CaptureHandoff` is hand-written and `captureHandoffTable.ts` casts the client once, named, with a Zod parse on every row behind it. The day `media` joins that list, delete both and alias the generated row. |
| `media.capture_handoff` in `supabase_realtime` | **YES**, since aidream migration 0873, and `REPLICA IDENTITY FULL`. Both verified directly against `pg_publication_tables` / `pg_class.relreplident`, not taken on report. FULL is the half that matters here: the tray's most important event is a row LEAVING the queue, and without the old row an UPDATE that moves a row out of the filter is indistinguishable from one that was never in it. It was **NO** until that migration, which is the bug this feature's `liveness` reporting found — keep the reporting. |
| real rows in the live queue | **YES.** Two `waiting` / `own_browser` rows for org `304cd2ed…`, written by the real scraper climbing http → server browser against instagram.com and nytimes.com and being told `login_wall` by both. They are the fixture in `__tests__/liveQueueRows.test.ts`. |
| aidream `/capture/*` | **NOT LIVE.** Built by a sibling lane. `sendToOwnBrowser.ts` is written against CONTRACT.md §4 and treats a 404 as its own named outcome with its own sentence, so the button says "not switched on yet" rather than showing a red error nobody can act on. |
| the ladder fields on `/quick-scrape` | **On the server's `ScrapeResult` and reaching `to_dict()`; not deployed.** Verified by reading `orchestrator.py` and `scrape_options.py::apply_field_flags` (a denylist none of them are on) — NOT by calling the endpoint. Until it deploys, `readLadderOutcome` returns `null` and the Rung column says "Not said". |
| `media_capture_handoff` in `@ai-matrx/associations` | **Regenerated in aidream, but NOT in the copy installed here** — a package-version lag, not a missing token. Nothing in this feature depends on it, so nothing here is blocked; it lands on the next dependency bump. |

## Where the contract and reality differ

Reported rather than reconciled — CONTRACT.md is somebody else's file to change:

- `final_url` is on the live table and absent from §3's column list.
- `next_rung_what_to_do` and `next_rung_estimated_seconds` are on the server's
  `ScrapeResult` and absent from §2's field list.
- §3 says `what_to_do` is "Empty for `own_browser`"; the live column is
  `NOT NULL DEFAULT ''`, so "empty" means `''`, never `null`. Same for `title`,
  `reason` and `reason_note`, all NOT NULL.
- `captured_by_rung`'s live CHECK admits only `own_browser` and `human_drive`,
  which §3 does not say.

## Guards

`__tests__/liveQueueRows.test.ts` — the two REAL rows out of the live queue, read
verbatim, run through the tray's ingress parse and its sentences. Not a fixture
shaped like the contract: a fixture shaped like the contract would have had a
title on every row, and the real Instagram row does not. Proven failing (3 of 8)
by assuming it does — and the failure is the exact silent one, a tray reading
"1 page" while two were waiting.

`__tests__/ladderLaw.test.ts` — `assertNoSkippedRung` refuses a jump, a repeat, a
backwards step and a rung key that does not exist. Proven failing (7 of 11) with
the order check disabled.

`__tests__/sendToOwnBrowserSelection.test.ts` — the "send the rest to my browser"
selection can never contain a row that did not stop at `own_browser`. The
selection filters AND re-checks, and the re-check reads `next_rung` literally
rather than re-calling the predicate, so it can disagree with the thing it
guards. Proven failing (7 of 7) with the filter inverted — including the
post-condition throwing on rows a broken filter let through.

## When you change something here

- A new rung, status or stop cause is a CONTRACT change first. `RUNGS` is
  declared once, in `aidream/packages/matrx-scraper/matrx_scraper/ladder.py`;
  `types.ts` imports those strings and never re-orders them.
- A new reason a page goes to rung 3 belongs in aidream's `OWN_BROWSER_REASONS`,
  not in a client-side filter.
- A new sentence a person reads about a particular page comes from the SERVER
  (`reason_note`, `what_to_do`, `next_rung_note`). This feature only owns the
  standing wording that is true of a rung in general.
