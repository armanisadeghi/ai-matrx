# FEATURE.md — `detail` (the Detail primitive's HOST WIRING in matrx-frontend)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-17`

---

## Purpose

The Detail primitive — ONE core component per record type (header, source health strip,
fields, associations, history) wrapped once so it shows as a **window** (default), a
**docked** side panel, or a **page** — is the package **`@ai-matrx/detail`**
(`aidream/apps/shared/detail`; README = the contract, FEATURE.md = the implementation truth,
the suite under `src/**/__tests__` = its proof). Nothing of the primitive lives in this
directory any more: this file documents how THIS app binds the package's ports, where each
piece of host wiring sits, and what the chair still owes once the package is on npm. Arman,
2026-09-17: *"build the primitive as a package so it stops being 'a thing'"*.

Entries this repo imports: `@ai-matrx/detail` (contract, list trim, deep-link spelling incl.
`encodeListQuery` / `decodeListQuery`, `fieldsFromRow`), `@ai-matrx/detail/react` (ports,
core, presentations, header/body/pane, geometry constants), `@ai-matrx/detail/testing` (the
stub-port seat, bound here with `makePortsWith(jest.fn)`).

---

## Entry points

**Routes**
- `app/(core)/detail/[type]/[id]/page.tsx` — the page presentation (`?l=type.id,…&i=<n>&lt=<total>` = list context) → `features/window-panels/detail/DetailPageRoute.tsx`.
- `app/(core)/detail/page.tsx` — the feature-visibility surface (`features/window-panels/detail/DetailShowcase.tsx`); `app/(dev)/demos/detail-primitive/page.dev.tsx` renders the same body for the demos deployment.

**The host binding (every port the package declares)** — `features/window-panels/detail/`:
- `DetailHost.tsx` — the light half, mounted once in `app/Providers.tsx`: the presentation setting (`lib/scoped-config/sessionKnob` over `ui.detail.default_presentation` and `ui.detail.presentation_by_type`), `reReadPresentation`, `savePresentation` (`savePresentation.ts` → `setUserKnobMapEntry`), `open` / `close` (the typed overlay openers), `navigate` (`next/navigation`; `detailPageHref`, `canGoBack` = "did THIS tab push the page", `toRecordHome`), `doors` (`EntityDoorControls`, `MatrxUuidCell`, `tokenFromColumnName`, `isUuidValue`, `hasDoor` from `resolveEntityDoors`), `associations`, `history` (`public.version_list`), `notify` (`@/lib/toast`), `copyText`, `reconnectSource` (the Google connect window), and `remedy.typeMap` (names the item registry in the package's console remedy).
- `detailTypeBinding.ts` — the `resolveType` port = `resolveItemDetailType` (`features/item-presentation/detail.tsx` over `registry.tsx`, THE type map; never a second). Bound by each presentation's entry, not at boot.
- `shells/DetailWindowShell.tsx` (`WindowPanel`, urlSync `detail:<type>.<id>:as-window` + the list args) · `shells/DetailDockedShell.tsx` (`SidePanelSurface`, `useUrlSync`) · `shells/DetailPageShell.tsx` (`RouteHeader` + scroll body).
- `listContextCap.ts` — THE one place `ui.detail.list_context_max_ids` becomes a number (`detailListContextMax`), read by `detailPageHref` and the window shell.
- `detailOverlayData.ts` — the overlay-slice (Redux) shape of an instance and its parser; the URL spellings are the package's.
- `openDetailSingleton.ts` + `singletonReplacement.ts` — the ONE opener of `detailWindow` / `detailDocked` (both opener hooks and the hydrator go through it; it announces the record it replaced, with Undo).
- `pageSeedHandoff.ts` — what the opener knew travels with the navigation, never in the URL.

**Overlay entries and openers**: `features/window-panels/windows/detail/DetailWindow.tsx` / `DetailDocked.tsx` (each binds its shell + the type map right above the presentation); `features/overlays/openers/detailWindow.tsx` / `detailDocked.tsx`; metadata in `features/window-panels/registry/windowRegistryMetadata.ts`; hydrator `detail` in `features/window-panels/url-sync/initUrlHydration.ts`.

**The type map's producers**: `features/item-presentation/detail.tsx` (`resolveItemDetailType`), `ItemDetailFrame.tsx` (the `Frame`: surface runtime + right-click menu), `sourceHealth.ts` (the `health` producer: the connectors' own `productHealth` over the server's `capability_health`; its type → product map is DERIVED from the connectors' product config, aliases only by hand), `useOpenItemPresentation.ts` (routes non-bespoke types through `useOpenDetail`).

---

## Data model

- `platform.feature_knob` rows `ui.detail` / `default_presentation`, `presentation_by_type`, `list_context_max_ids` — seeded by `migrations/detail_presentation_knob.sql`, `detail_presentation_by_type_knob.sql`, `detail_list_context_max_knob.sql` (+ `detail_list_context_max_ceiling.sql`), all applied and ledgered 2026-09-17; `migrations/detail_list_context_max_deliverable.sql` (lowers `max_value` / default to the 100 the URL can carry) was written by F-31 for the chair — check `pnpm check:migrations` for its state. The package never reads the ladder; this host resolves the keys and passes values through ports.
- `public.version_list(p_token, p_id)` — the history port.
- The record itself — whatever the registry's `detailSource` reads (RLS).

---

## Invariants & gotchas (host side; the primitive's own are in the package)

- **`@ai-matrx/detail` is declared `"latest"` like every `@ai-matrx/*` dependency** (THE LATEST LAW). Until its first npm publish lands, `pnpm install` cannot resolve it here — the adoption commit was verified against the workspace build in `aidream/apps/shared/detail/dist` through a scratch jest/tsc config (never committed). **Owed to the chair once published:** `pnpm install`, `pnpm check:matrx-packages`, the CI `type-check`.
- **`app/globals.css` registers the package's dist with Tailwind** (`@source "../node_modules/@ai-matrx/detail/dist";`, the design-system precedent) — the primitive is utility-styled and this repo's scan must see it, or the header collapse, the `pointer-coarse:` targets and the pane lose their classes silently.
- **Host tests use the package's seat**: `makePortsWith(jest.fn)` from `@ai-matrx/detail/testing` — never a local copy of the harness.
- **A health producer says `onReconnect: null` when a reconnect would not help, and OMITS the key to defer to `reconnectSource`** — `sourceHealth.ts` does exactly that (`reconnectWouldHelp`); the package honours the difference (Bugbot round 18, frontend PR 228).
- **The type → product map is a census, not a list.** `PRODUCT_BY_ITEM_TYPE` in `sourceHealth.ts` is derived from `GOOGLE_CONNECTOR_PROVIDER.products[].attachableResourceTypes` plus the hand aliases whose item tokens differ (`linked_document`, `calendar_event`, `gsc_property`, …); `features/item-presentation/__tests__/every-attachable-type-has-a-product.test.ts` walks the config. Red at the hand-typed map: `google_presentation`, `search_console_property`, `analytics_property`, `youtube_channel` all resolved to no product.
- **THE type map is `features/item-presentation/registry.tsx`** (chair ruling 2026-09-17); the shells and the map are bound per presentation entry, never at boot.
- **`/detail/**` is in `utils/auth/protected-routes.ts`**; the route never double-decodes its params (`pnpm check:route-param-decode`).
- Everything the verification rounds pinned about the primitive itself (D1–D8, NEW-1…NEW-25) is documented at the line it holds inside the package and proven by its suite — read it there.

---

## Related features

- The package: `aidream/apps/shared/detail` (`@ai-matrx/detail`).
- Host cross-links: [`features/window-panels/FEATURE.md`](../../features/window-panels/FEATURE.md) § The Detail primitive; `features/item-presentation/`; `lib/scoped-config/`; `common-docs/projects/google-native/PLAN.md` §5.1.

---

## Change log

- 2026-09-17 — **B-16: the primitive is a package.** Every source file and suite under `lib/detail/` moved to `aidream/apps/shared/detail` (`@ai-matrx/detail` 0.1.0, aidream `46c06f1184`); this directory keeps only this host-wiring doc. 28 importers rewired to the three package entries; `encodeListQuery` / `decodeListQuery` left `detailOverlayData.ts` for the package; `DetailHost` binds the new `remedy.typeMap` port; the two host tests bind the package seat with `makePortsWith(jest.fn)`; `package.json` declares `@ai-matrx/detail: latest`; `app/globals.css` registers its dist. Carried in the same commit: the `onReconnect: null` contract fix lives in the package (red 2/4 → green 4/4 there), and `sourceHealth.ts`'s product map is derived from the connectors' config with a census test (red 4 of 8 at the hand-typed map → green 8/8). Verified against the workspace build: 21 host suites / 107 tests (`features/window-panels/detail`, `features/item-presentation`, `detailDeepLink`, `features/overlays`, `lib/scoped-config`, `utils/auth` detail deep links), scoped `tsc --noEmit` clean in every touched path (29 pre-existing diagnostics elsewhere), `pnpm check:parse`, `pnpm check:kind-marker-law`. **Not done here:** `pnpm install` / lockfile / `check:matrx-packages` (the package is not on npm yet) and anything on a screen.
- Earlier entries (F-5 … F-34, the build) are preserved in git history at `lib/detail/FEATURE.md@8abe598b`; their substance now lives in the package's FEATURE.md and CHANGELOG.
