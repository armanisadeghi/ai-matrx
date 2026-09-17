# FEATURE: Bring your export

**Status:** Built, NOT live-verified · **Entry points:** `/exports`, `/exports/[libraryId]`
(`app/(core)/exports/`) · **Server:** aidream, bare `/media` prefix

A person drops the `.zip` / `.tgz` / `.mbox` a service handed them when they
downloaded their own data (Google Takeout, Slack, LinkedIn, WhatsApp, Notion,
Kindle, X, Instagram…). Within seconds they see what it is and how much of it
there is, then a filterable, sortable, server-paged list of everything inside,
and one action: send the parts worth keeping to a Masterwork Rulebook as
Sources.

## 🚨 Three invariants, in order of how badly breaking them would hurt

1. **THERE IS NO BODY TEXT, ANYWHERE, ON PURPOSE.** An export holds other
   people's words. The API serves no message content and there must never be an
   endpoint that does, so nothing here renders, requests, caches or copies it.
   The row's "open" (`components/ExportItemDetailsDialog.tsx`) is a METADATA
   sheet that says so in its own first line. Anyone adding a preview pane is
   removing the reason this feature is allowed to exist.
2. **THE CONFIRMED SENTENCE IS THE CONSENT RECORD.** `consent.ts` builds ONE
   string naming how many items, which Rulebook, and that an AI model will read
   the text; the dialog renders it verbatim and posts it verbatim. The server
   stores it and refuses the send without it (403 `consent_required`). Never
   re-phrase it between the screen and the wire.
3. **BOTH TOTALS, NEVER `items.length`.** `filtered_total` is what the filter
   matches; `total` is the whole export. The list shell is fed the first and the
   page prints both. A line that showed the rows on screen as if they were
   everything is the failure this feature is judged on.

## The pieces

| File | What it is |
|---|---|
| `types.ts` | The wire vocabulary — a documented TEMPORARY hand-mirror (see below) |
| `api.ts` | Every `/media/*` call, through `lib/python-client` (base-url selection, fresh JWT, Error Inspector) |
| `consent.ts` | The one builder for the confirmed sentence |
| `freshExport.ts` | A one-hop sessionStorage head start from the drop zone; NEVER the source of truth |
| `rulebooks.ts` | The Rulebook picker's list — browser → Supabase, like every other client read |
| `browse/itemQuery.ts` | THE ONE mapping from the entity-list filter bag to the items query — used by the page read AND the bulk verb, so the number in the confirmation and the rows the server acts on cannot disagree |
| `browse/service.ts` | The `EntityListService` triple, built per Library (hence `serviceKey`) |
| `browse/columns.tsx` | The column registry. Five columns sort (the server's five `order` keys); the rest declare `sortable: false` rather than offering a control that silently falls back |
| `browse/listConfig.tsx` | The `EntityListConfig` factory, including the one bulk action |
| `components/*` | Drop zone, adapter catalogue, summary, index progress, quick views, the send dialog |

## The bulk action sends a FILTER, not ids

`bulkSelection.selectAllMatching` is on, so the shell offers "every item
matching this filter". When the person takes it, `EntityBulkSelection.mode` is
`"matching"` and the action posts `filter` (mapped from `selection.filter` by
`toItemFilterFromBulk`) instead of `item_ids` — 50,000 ids never go over the
wire. In `"ids"` mode it posts the ids. See `browse/listConfig.tsx`.

The action declares no shell `confirm`: the dialog IS the confirmation, and it
has to be, because only it can produce the exact sentence the server requires.

## "Sent by me, longest first" is one click

It is first in `components/QuickViews.tsx`, styled as the primary control, and
writes `direction=outbound` + `sort=char_count&dir=desc` to the URL (the config
sets `urlState: true`, so the view is linkable and the sort survives the
recipient's stored preference). When `summary.owner_identity` is null the
summary says so and the person picks themselves out of the correspondents; the
same pill then filters by that NAME instead of by a direction nothing could
compute, and its label changes to match.

## 🚨 The wire types are a hand-mirror, and that is a debt with an expiry

`lib/api/FEATURE.md` rule 1 says request/response types are derived from
`types/python-generated/api-types.ts`, never hand-written. `types.ts` breaks
that deliberately: on 2026-09-17 the deployed server (sha `47afca2b13`) answers
`GET /media/export-adapters` with 404 and its `openapi.json` contains none of
the seven routes, so there was nothing to derive from. The moment the server
ships:

```
node scripts/sync-types.mjs --fast --url https://server.app.matrxserver.com
```

then replace every interface in `types.ts` with `components["schemas"][…]`
aliases and move `api.ts` onto `lib/api/typed-client`'s `apiGet` / `apiPost`.

`GET /media/libraries/{id}` is the one route this feature calls that was not in
the contract handed to it; it is the obvious companion to `POST /media/exports`
(which returns a `library`), and the page degrades honestly when it refuses —
the banner names what is missing and the item list, a separate read, stays real.

## Verified / not verified

Verified on the local preview as `admin@admin.com`, 1440 and 390, light and
dark: both routes render, the adapter catalogue's unreadable-server state, the
library page's missing-summary banner, the list's failed-read banner with
Retry, the quick-view row, and the empty state. `pnpm lint` and `tsc --noEmit`
clean on every touched file; `check:route-metadata` and `check:page-headers`
clean for `/exports`.

NOT verified, because the server routes 404: a real upload → detection → index
stream → summary → item list → send-to-Rulebook round trip. Nothing in this
feature has ever seen a real export.
