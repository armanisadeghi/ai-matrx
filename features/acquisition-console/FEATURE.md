# FEATURE.md — `acquisition-console`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-19`

---

## Purpose

`/acquisition` — one screen per expert. It answers three questions a person
onboarding a Subject Matter Expert has to answer without asking an engineer:
what we already have from them, what accounts they are reached through, and
what is stuck plus the one action that unsticks it.

It is the index of the `/acquisition` family, so the Block Ledger at
`/acquisition/blocks` reads as its drill-down rather than a sibling nobody finds.

---

## The one design rule

🚨 **Nothing on this screen is stored, and nothing on it is written.** Every
number is counted here, in the browser, out of five registers that already
exist. That is deliberate: a console with a table of its own would need its own
backfill and its own refresh, and would grow its own class of "the tile says 0
while the list says 5" — a defect the Acquisition Frontier project has already
hit four times on the metrics header at `/libraries`.

The five registers, each read directly through supabase-js with RLS:

| Register | What the console takes from it |
|---|---|
| `media.source_library` | Libraries, per kind and lane, with `metrics` for yield |
| `platform.masterwork_source` | Own-files Sources kept on Rulebooks |
| `users.integration_connections` | Connection state per provider |
| `platform.acquisition_block` | Ranked blocks and their remedy |
| `media.capture_handoff` | Hand-offs waiting on the person's own browser |

---

## Entry points

**Routes**
- `app/(core)/acquisition/page.tsx` — auth-gated; renders `AcquisitionConsolePage`
  inside a `Suspense` boundary (the Rulebook filter reads `useSearchParams`).

**Components**
- `AcquisitionConsolePage.tsx` — the page: one-row header, Rulebook filter, three sections.
- `columns.tsx` — the three `MatrxColumnDef` sets.

**Service**
- `service.ts` — `loadConsole(organizationId, userId, rulebookId)`; the five reads, bounded.

**Contract**
- `contract.ts` — per-row narrowing over every read, plus the two roll-ups.

No Redux slice, no API endpoint, no write path.

---

## The rules this feature keeps, and where each lives

- **The organization is passed, never defaulted** (`service.ts` header). Four of
  the five reads filter on the id the caller hands in. `integration_connections`
  is the documented exception: a person's own connections carry
  `organization_id = NULL`, so the read asks for both halves by name and the
  table labels which is which.
- **Four visibility lanes, never a flat list** (`contract.ts` `rollUpLibraries`).
  `media.source_library.visibility` is the platform's `personal · internal ·
  link · public` enum, and in the live database 32 of AI Matrx's 33 Libraries
  are `personal`. The first table groups by kind AND lane, so two people in one
  workspace never read one undifferentiated number under one word. Somebody
  else's `personal` Library reaching this seat through a share reads as "Shared
  with you", not as yours.
- **Per-row narrowing, never all-or-nothing** (`contract.ts`, `lib/contract/narrow.ts`
  `mapListRows`). One unreadable row costs one row and is named on screen.
- **Nothing fails silently.** A read that hits its 2,000-row cap says so. A yield
  the server never reported reads "Not reported yet" and sorts below a real zero
  — it is never printed as `0`. The action column is never blank: "Nothing to do"
  is an answer.
- **Never a second delivery surface.** Every action reuses the remedy the
  register already wrote (`unblock_note` / `lawful_route` on a block,
  `what_to_do` on a hand-off) and links to the screen that already owns it.

---

## The Rulebook filter, and what it deliberately does not do

`?rulebook=<id>` narrows **what is kept on Rulebooks**. It removes the Library
rows rather than leaving them in place pretending to be about that Rulebook: a
Library belongs to the workspace and to no single Rulebook. The section header
says this in words when a Rulebook is chosen. Connections and blocks are
workspace-wide facts and are never narrowed — there is no rulebook→block join in
the database to narrow them by.

---

## Guards

- `features/acquisition-console/__tests__/one-unreadable-row.test.tsx` — 9 tests.
  Proven failing-then-passing: reintroducing `items.map(parseOne)` in place of
  `mapListRows` turns 6 of them red.
- `scripts/campaign-tests/acquisition_console_rls_seat.sql` — the RLS seat test.
  Read-only, rolls back, no credentials: a member of the workspace reads it and
  reads none of anyone else's personal lane; a seat outside it reads zero
  Libraries, blocks, hand-offs and connections. Proven forcing by handing PART 2
  an inside seat, which raises.

---

## Change Log

- **2026-09-19** — Created. Board row H5 (Acquisition Frontier). v1: three
  sections composed entirely from existing data, visibility lanes wired in after
  the seat test surfaced that a member reads 1 of 33 Libraries.
