# FEATURE.md — `detail` (the Detail primitive, `lib/detail`)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-17`

---

## Purpose

ONE core component per record type — header, source health strip, fields, associations,
history — wrapped once so it shows as a **window** (default), a **docked** side panel, or a
**page**, chosen by the person's `ui.detail.default_presentation` setting. Every surface that
names a record opens it through the one opener; agents' item cards, list rows and doors all
land here. Package-shaped: see [README.md](./README.md) for the boundary and the extraction plan.

---

## Entry points

**Routes**
- `app/(core)/detail/[type]/[id]/page.tsx` — the page presentation (`?l=type.id,…&i=<n>` = list context).
- `app/(dev)/demos/detail-primitive/page.dev.tsx` — one real file in all three presentations, desktop and 390px.

**Hooks**
- `useOpenDetail(warmType?)` (`useOpenDetail.ts`) — THE opener. Resolves the setting, opens in place; `page` navigates.
- `useDetailCore(data, presentation, { onClose })` (`core/useDetailCore.ts`) — the core as state.
- `useDetailKeyboard` — Escape · `[` `]` · Cmd/Ctrl+Enter.
- `useDetailHost` / `DetailHostProvider` (`host.tsx`) — the ports.

**Components**
- `DetailWindowPresentation` · `DetailDockedPresentation` · `DetailPagePresentation` (`presentations.tsx`).
- `DetailTitle` · `DetailActions` (`core/DetailHeader.tsx`) · `DetailBody` (`core/DetailBody.tsx`).

**Overlays (host)**
- `detailWindow` (window, `mobilePresentation: "drawer"`, `urlSync.key: "detail"`) → `features/window-panels/windows/detail/DetailWindow.tsx`.
- `detailDocked` (sheet, `urlSync.key: "detail"`) → `features/window-panels/windows/detail/DetailDocked.tsx`.
- Openers: `features/overlays/openers/detailWindow.tsx`, `detailDocked.tsx`.

**Redux slice(s)**
- None new. The overlay slice carries the instance (`type`, `id`, `seedName`, `seedAbout`, `listItems`, `listIndex`); the window manager slice sees the window through `WindowPanel` as usual. Decision recorded 2026-09-17: every piece of detail state is either the record (loaded per mount) or the open request (already in the overlay slice), so a third slice would be a parallel store.

---

## Data model

**Database tables / RPCs**
- `platform.feature_knob` row `ui.detail` / `default_presentation` (enum `window|docked|page`, default `window`, overridable by organization + user) — `migrations/detail_presentation_knob.sql`. Read through `lib/scoped-config/sessionKnob.ts` → `platform.knob_resolve`.
- `public.version_list(p_token, p_id)` — the history section (`history.row_versions`, viewer-gated).
- The record itself — whatever the registration's `load` reads (item-presentation: the registry's `detailSource`, RLS).

**Key types** (`types.ts`): `DetailPresentation`, `DetailRecordType`, `DetailField`, `DetailSourceHealth`, `DetailListContext`, `DetailInstanceData`, `DetailHistoryEntry`.

---

## Key flows

1. **A card is clicked.** `useOpenItemPresentation` → `useOpenDetail()({ type, id, seed })` → `host.resolvePresentation` (cached knob; RAISES when unregistered → toast + window) → `host.open({ presentation, data })` → opener dispatches `openOverlay("detailWindow" | "detailDocked")`, or `router.push("/detail/<type>/<id>")` for `page`.
2. **The overlay renders.** `OverlayController` block → lazy `DetailWindow` → `<DetailHostProvider ports={{ resolveType, shells: { Window } }}>` → `DetailWindowPresentation` → `useDetailCore`: `resolveType(type)` (item-presentation registry) → `useDetailRecord` (abortable load) → title/fields/health → shell slots filled → `DetailBody` sections.
3. **Switch presentation from inside.** `DetailActions` → `core.switchTo("docked")` → `host.open(docked)` then `host.close(window)`; from `page` → open window then `router.back()`.
4. **Deep link.** `?panels=detail:task.<id>:as-docked` → `UrlPanelManager` → hydrator `detail` → `openOverlay("detailDocked")`; the mounted shell re-registers the same token (`useUrlSync` / `WindowPanel` urlSync props) so the URL round-trips.
5. **`[` / `]`.** `useDetailKeyboard` on the presentation root → `core.list.next()` → `host.open` with `list.index + 1` (singleton retargets) or `toPage(next, { list })`.

---

## Invariants & gotchas

- **THE type map is `features/item-presentation/registry.tsx`** (chair ruling 2026-09-17) — `resolveItemDetailType` adapts it; never a second registry. Unknown types still resolve (neutral fallback, seed-only), exactly as the old window did.
- **`resolveType` and the shells are bound by each presentation's entry, not at boot.** The window shell parses `WindowPanel` and the type map pulls the right-click menu; `DetailHost` (boot, in `app/Providers.tsx`) binds only what `useOpenDetail` needs. `useDetailHost` throws naming a missing port; `requireShell` / `requireResolveType` name the entry that forgot.
- **The registry `urlSync.key` wins over shell props** (`resolveWindowUrlSyncKey`); the shell supplies only the instance (`type.id`) and `as`.
- **`docked` is not `drawer`.** `drawer` in this codebase is the vaul bottom sheet (`mobilePresentation: "drawer"`); the third presentation is `docked` (chair ruling 2026-09-17).
- **Escape is handled on the presentation root (capture)**, and `MatrxDynamicPanelHost` also closes on document Escape — both dispatch the same idempotent close.
- **Keys read on the root ignore typing targets** except Cmd/Ctrl+Enter, which is the point of a field.
- **A `<token>_id` column becomes a door only when its value is a real uuid AND the token has a door** (`tokenFromColumnName` is strict) — a wrong link is worse than no link.
- **The associations section shows only for tokens in `ASSOCIATION_TARGET_TYPES`**; default tokens `task, note, file, project` minus the record's own token.
- **`check:settings-unregistered` will name `ui.detail.default_presentation` until the migration is applied** — that is the guard doing its job, not a false positive.

---

## Related features

- Depends on: `@ai-matrx/associations` (cards, grid, `isEntityTypeToken`), `@ai-matrx/design-system`, host ports from `features/window-panels/detail/`, `lib/scoped-config`.
- Depended on by: `features/item-presentation` (`useOpenItemPresentation`), the `/demos/detail-primitive` demo.
- Cross-links: [`features/window-panels/FEATURE.md`](../../features/window-panels/FEATURE.md) § The Detail primitive; `common-docs/projects/google-native/PLAN.md` §5.1.

---

## Doctrine compliance

**Primitives reused** (searched before building): `WindowPanel` + window registry metadata + `lazyOverlay` + typed openers (window presentation, deep links); `SidePanelSurface` → `MatrxDynamicPanelHost` on react-resizable-panels v4 (docked presentation — found by searching `features/overlays/surfaces`, so no second docked panel was built); `RouteHeader` + `PageHeader` + `ChevronLeftTapButton` (page); `useUrlSync` / `UrlPanelManager` / `initUrlHydration` (deep links — no second URL mechanism); `lib/scoped-config/sessionKnob` (the knob read); `EntityDoorControls`, `MatrxUuidCell`, `tokenFromColumnName` / `isUuidValue` (doors); `AssociationCardGrid` + `PrimaryEntityProvider` (associations, as `PartyRecordPage` does); `public.version_list` (history, as the working document does); `NonEditableContextMenu` + `SurfaceRuntimeProvider` + the `matrx-user/item-detail` manifest (the item frame, moved verbatim); `useClippedContentGuard`; `toast`, `copyToClipboard`.

**Primitives introduced**
- `lib/detail/*` — Why new: nothing produced three presentations from one registration; seven bespoke `*DetailPanel.tsx` files and the generic `ItemDetailWindow` each hand-rolled chrome. Considered extending `ItemDetailWindow` — rejected: it was one presentation with the core and the chrome fused.
- `detailWindow` / `detailDocked` overlays — replace `itemDetailWindow` (deleted; no legacy).

---

## Change log

- 2026-09-17 — Built. `ItemDetailWindow` migrated end to end (deleted; `resolveItemDetailType` + `ItemDetailFrame` carry its loader, fields, surface scope and right-click menu); `useOpenItemPresentation` routes non-bespoke types through `useOpenDetail`; `file`/`image`/`video`/`audio` gained a `detailSource` (`files.files`). Knob file `migrations/detail_presentation_knob.sql` written, not applied (the chair applies DB files). Demo `/demos/detail-primitive`.
