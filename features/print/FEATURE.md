# FEATURE.md — `print`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-11`

---

## Purpose

The platform's print hub: one index at `/print` of everything AI Matrx can put on paper, and a working page per printable. Every printer is the published `@ai-matrx/print` package — this feature owns product surfaces, never printing logic. `/print/order` is the one page that talks to a server: it prices a print-on-demand book against the Lulu catalog on aidream and opens a real Stripe Checkout behind a live-money gate.

---

## Entry points

**Routes** (all `app/(core)/print/`)

- `/print` — the hub. Guests get `PrintLanding` (public marketing), members get `PrintHub`. The branch is server-side in `page.tsx`, not the layout, so the section pages stay reachable signed out.
- `/print/flashcards` · `/print/education` · `/print/exams` · `/print/certificates` — Education printables.
- `/print/labels` · `/print/qr` · `/print/branded-qr` · `/print/barcodes` · `/print/zpl` — Labels & codes.
- `/print/documents` · `/print/booklet` — Documents.
- `/print/order` — the print-on-demand calculator and paid order flow. **Auth-gated** in its own `layout.tsx`.
- `/print/admin` — the feature admin map.

**Components**

- `features/print/hub/catalog.ts` — **THE list of printables.** The hub grid and the section header dropdown both read it; there is no second list.
- `features/print/hub/PrintHub.tsx` + `PrintHubHeader.tsx` — the hub body and its shell header.
- `features/print/components/PrintSectionFrame.tsx` — the body frame every `/print/<section>` page sits in (header injection + `pt-[var(--shell-header-h)]`).
- `features/print/components/PrintSectionHeader.tsx` — the ONE shell header under `/print`.
- `features/print/components/shared.tsx` — `SectionShell`, `StatusChip`, `Field`, `announcePrintOutcome`.
- `features/print/sections/*.tsx` — one component per printable; each calls the published package directly.
- `features/print/order/**` — the Lulu configurator, price panel, order flow, and the live-money gate.

**Services / APIs**

- Everything under `/print/*` except `order` runs entirely in the browser against `@ai-matrx/print`. No server, no database, no organization context.
- `/print/order` calls `GET /lulu/catalog`, `POST /lulu/price`, the shipping and order endpoints, and `GET /lulu/payment-mode` on aidream — all through the generated typed client (`lib/api/typed-client`), all bound to `types/python-generated/api-types.ts`.

**Redux slice(s)** — none. `/print/order` reads `selectOrganizationId` from `appContextSlice`; nothing here owns state.

---

## Admin map

`/print/admin` — config at `features/print/admin/printAdminMap.ts`, rendered by `app/(core)/print/admin/page.tsx`. `routeScanPath` is `app/(core)/print`, so a new section route that is not listed shows as drift on the rendered page. **Adding a printable means three edits: the section component, the route, and a row in `hub/catalog.ts` — plus the admin map row.**

---

## Data model

No tables of its own. `/print/order` writes orders through the aidream order API; the order rows live server-side. Sample payloads for the section pages live in `features/print/sections/sample-data.ts` and are fixtures, not records.

---

## Key flows

**1 — A visitor prints something**
`/print` → `PrintHub` renders `PRINT_CATALOG` grouped by `PRINT_GROUPS` → a tile navigates to `/print/<slug>` → `PrintSectionFrame` mounts `PrintSectionHeader` (back chevron + sibling dropdown) and the section component → the section calls its `@ai-matrx/print` printer → `announcePrintOutcome` toasts `opened` or, when the popup was blocked, the `.html` download fallback with the remedy.

**2 — A guest lands on `/print`**
`page.tsx` calls `getServerAuth()` (request-scope cached). Unauthenticated → `MarketingPageShell` + `PrintLanding`, registered in `MODULE_LANDING_DIRECTORY` so it appears on `/features` and in the sitemap. Never a login wall, never an error. Section pages are not branched — they work signed out for real.

**3 — Ordering printed copies**
`/print/order/layout.tsx` branches guests to `ModuleSignInGate` (the Lulu routes are behind `require_authenticated`, and the client-side org-context kernel refuses before a request even fires). A member gets `PrintOrderWorkspace`: `GET /lulu/catalog` builds a constraint graph, invalid combinations disable themselves with an inline reason, a debounced `POST /lulu/price` runs once every field is set, and `OrderFlow` asks the backend what payment mode it is in before it will show an enabled **Order & pay**.

---

## Invariants & gotchas

- 🚨 **The live-money gate is load-bearing.** `features/print/order/ordering-gate.ts` reads `GET /lulu/payment-mode` and keeps ordering shut unless the backend names its mode and its Stripe/Lulu pairing agrees. It has been deleted three times (2026-09-07) to clear a type error. A type error here is fixed in the READER; the gate is never removed. Its forcing test is `features/print/order/__tests__/order-gate.test.tsx`. Read the file header before touching it.
- **There is ONE list of printables.** `hub/catalog.ts`. A page that exists without a catalog row is invisible on the hub and missing from the section dropdown.
- **Never fork a printer.** Every printable calls the published `@ai-matrx/print` entry. A fix that belongs in the package is made in the package (`aidream/apps/shared/print`), released, and adopted the same session.
- **The section pages are deliberately un-gated.** They render for guests because they genuinely work for guests. Do not add an auth branch to `app/(core)/print/layout.tsx` — only `/print` itself and `/print/order` branch.
- **Print windows are unauthenticated documents.** Every image a printer emits must be inlined as a data URI; a fetched URL renders blank.
- **No agent disclosure.** These surfaces run fixed printers, not mandates. There is no AI job here to register, and disclosure may never invent one.

---

## Related features

- Depends on: `@ai-matrx/print` (the whole printing core), `features/shell` (header primitives), `features/auth/components/module-landing` (the guest landing).
- Depended on by: nothing imports this feature; other features link to it.
- Cross-links:
  - [`features/commerce-intake/FEATURE.md`](../commerce-intake/FEATURE.md) — label batches and printer certification; the hub links to `/commerce/labels` and `/commerce/labels/printers` rather than forking them, and both pages carry a "Print hub" link back.
  - [`features/flashcards/FEATURE.md`](../flashcards/FEATURE.md) — set detail prints through the same `flashcardsPrinter` and carries a "More printing" door to `/print`.
  - `features/rich-document/actions/handlers/print.ts` — the canonical per-document Print action (notes, chat messages, artifacts, scraper results).
  - `.claude/skills/block-print-system/SKILL.md` — how to add a printer to a block.

---

## Doctrine compliance

**Primitives reused**

- Components: `RouteHeader` / `PageHeader` (shell header injection), `ChevronLeftTapButton` (`@ai-matrx/tap-target`), `DropdownMenu` / `Button` (`components/ui`), `ModuleLanding` + `ModuleSignInGate` + `MarketingPageShell`, `FeatureAdminPage`, `ErrorBoundaryView`, `confirm()` from the confirm-dialog host.
- Printers: every entry of `@ai-matrx/print` — `/core`, `/qr`, `/labels`, `/flashcards`, `/markdown`, `/pdf`, `/react`, and the wave-3 education / exam / certificate / ZPL entries.
- Services: `lib/api/typed-client` bound to the generated Python contract; `toast` from `@/lib/toast`; `createRouteMetadata`.
- Redux: `selectOrganizationId` (`appContextSlice`) — read only.

**Primitives introduced**

- `PRINT_CATALOG` (`features/print/hub/catalog.ts`) — Why a new type: no existing registry describes "a thing you can print"; the nav registry is about navigation and the coming-soon registry is about promises. Considered extending: `nav-data.ts`. Rejected because: nav rows cannot carry blurbs, groups, or off-`/print` destinations without distorting the sidebar contract.
- `PrintSectionFrame` / `PrintSectionHeader` (`features/print/components/`) — Why new components: the sibling-hub header pattern (`CmsHubHeader`) is per-hub by design and there is no shared implementation to extend. Considered extending: `EntityModeHeader`. Rejected because: these are not `[id]` entity routes and have no mode nav.

---

## Current work / migration state

Migrated out of `(dev)` on 2026-09-11. The demo routes `/demos/print-studio` and `/demos/lulu-pricing` are **deleted**; `/print/*` is the only home. No shim, no redirect (pre-launch, no-legacy).

---

## Change log

- `2026-09-11` — Claude Fable 5.1: Verified live on `localhost:3001` — all 14 `/print` routes serve (`/print/admin` 307s for a non-admin, correctly); hub, QR, flashcards, label sheets, markdown, practice tests and the order page screenshotted; the flashcards printer proven to request a print window; signed-out `/print` serves the marketing landing; mobile (375×812) passes on the hub and on a section page. Review row `6b1ed4e2-963c-481d-9cf5-2e7b1719751f`; the two older demo rows were repointed to `/print` and `/print/order`.
- `2026-09-11` — Claude Fable 5.1: Built the Print hub as a `(core)` feature. Moved the 11 print-studio sections and the whole Lulu calculator + order flow out of `app/(dev)/demos/` into `features/print/`; added `/print` (hub, with a public `PrintLanding` for guests), 11 section routes, `/print/order`, and `/print/admin`. Registered Print in the shell nav and in `MODULE_LANDING_DIRECTORY`; cross-linked the commerce label surfaces and flashcards set detail. `ordering-gate.ts` and `OrderFlow.tsx` moved byte-identical.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log.
