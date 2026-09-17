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
- `app/(core)/detail/page.tsx` — THE feature-visibility surface: one real file of yours in all three presentations, with each deep link and the same record at 390px. It is in `(core)` because `(dev)` is compiled out of the `core` profile the preview server and the main site run, so the old demos-only path answered with a 307 nobody could follow (D6, 2026-09-17).
- `app/(dev)/demos/detail-primitive/page.dev.tsx` — the same surface for the demos deployment. Body for both: `features/window-panels/detail/DetailShowcase.tsx`.

**Hooks**
- `useOpenDetail(warmType?)` (`useOpenDetail.ts`) — THE opener. Resolves the setting, opens in place; `page` navigates.
- `useDetailCore(data, presentation, { onClose })` (`core/useDetailCore.ts`) — the core as state.
- `useDetailKeyboard` — Escape · ArrowUp/Down/Left/Right (with `[` `]` as aliases) · Cmd/Ctrl+Enter.
- `useDetailHost` / `DetailHostProvider` (`host.tsx`) — the ports.

**Components**
- `DetailWindowPresentation` · `DetailDockedPresentation` · `DetailPagePresentation` (`presentations.tsx`).
- `DetailTitle` · `DetailActions` · `DetailRecordMeta` (`core/DetailHeader.tsx`) · `DetailBody` (`core/DetailBody.tsx`) · `DetailPresentationPane` (`core/DetailPresentationPane.tsx`).

**Overlays (host)**
- `detailWindow` (window, `mobilePresentation: "drawer"`, `urlSync.key: "detail"`) → `features/window-panels/windows/detail/DetailWindow.tsx`.
- `detailDocked` (sheet, `urlSync.key: "detail"`) → `features/window-panels/windows/detail/DetailDocked.tsx`.
- Openers: `features/overlays/openers/detailWindow.tsx`, `detailDocked.tsx`.

**Redux slice(s)**
- None new. The overlay slice carries the instance (`type`, `id`, `seedName`, `seedAbout`, `listItems`, `listIndex`); the window manager slice sees the window through `WindowPanel` as usual. Decision recorded 2026-09-17: every piece of detail state is either the record (loaded per mount) or the open request (already in the overlay slice), so a third slice would be a parallel store.

---

## Data model

**Database tables / RPCs**
- `platform.feature_knob` row `ui.detail` / `default_presentation` (enum `window|docked|page`, default `window`, overridable by organization + user) — `migrations/detail_presentation_knob.sql`, **applied and live**: the row is in `platform.feature_knob` and the file carries a `public._schema_migrations` row from 2026-09-17 06:37:24Z (source `matrx-frontend`). Read through `lib/scoped-config/sessionKnob.ts` → `platform.knob_resolve`; written by `DetailPresentationPane` through `platform.knob_override_set`.
- `platform.feature_knob` row `ui.detail` / `presentation_by_type` — THE per-record-type override, a json map `{"file":"docked"}` on the same organization → user ladder, read before the default for the type being opened. `migrations/detail_presentation_by_type_knob.sql`, **written and NOT applied** (the session that wrote it had no database egress; the next release's migration sweep applies it). Until it is applied `knob_resolve` raises for the key by design, `DetailHost` catches that, warns once per tab naming the file, and the default answers — the override simply does not apply yet.
- `public.version_list(p_token, p_id)` — the history section (`history.row_versions`, viewer-gated).
- The record itself — whatever the registration's `load` reads (item-presentation: the registry's `detailSource`, RLS).

**Key types** (`types.ts`): `DetailPresentation`, `DetailRecordType`, `DetailField`, `DetailSourceHealth`, `DetailListContext`, `DetailInstanceData`, `DetailHistoryEntry`.

---

## Key flows

1. **A card is clicked.** `useOpenItemPresentation` → `useOpenDetail()({ type, id, seed })` → `host.resolvePresentation` (cached knob; RAISES when unregistered → toast + window) → `host.open({ presentation, data })` → opener dispatches `openOverlay("detailWindow" | "detailDocked")`, or `router.push("/detail/<type>/<id>")` for `page`.
2. **The overlay renders.** `OverlayController` block → lazy `DetailWindow` → `<DetailHostProvider ports={{ resolveType, shells: { Window } }}>` → `DetailWindowPresentation` → `useDetailCore`: `resolveType(type)` (item-presentation registry) → `useDetailRecord` (abortable load) → title/fields/health → shell slots filled → `DetailBody` sections.
3. **Switch presentation from inside.** `DetailActions` → `core.switchTo("docked")` → `host.open(docked)` then `host.close(window)`. From `page`: open the new presentation, then `host.navigate.canGoBack(ref)` decides — `back()` only when THIS tab pushed the page itself, otherwise `toRecordHome` replaces it with the record's own route (or `/dashboard`). Never a bare `back()`: a deep-linked page has nothing behind it and the tab landed on `about:blank` (D1).
4. **Deep link.** `?panels=detail:task.<id>:as-docked` → `UrlPanelManager` → hydrator `detail` → `openOverlay("detailDocked")`; the mounted shell re-registers the same token (`useUrlSync` / `WindowPanel` urlSync props) so the URL round-trips.
5. **Arrows (or `[` / `]`).** `useDetailKeyboard` on the presentation root → `core.list.next()` → `host.open` with `list.index + 1` (singleton retargets) or `toPage(next, { list })`.
6. **The setting is changed from the record.** `DetailPresentationPane` at the foot of every detail → `host.savePresentation({ presentation, forType })` → `platform.knob_override_set` at the person's rung (`forType` writes the per-type map). It registers `core.keyboard.registerSave` while open, so Cmd/Ctrl+Enter saves it — the chord's only caller until a record type ships an editable body.

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
- **A failed or unfinished load invents NOTHING.** The title comes from the loaded row or the seed; with neither it says what is happening, sets `data-detail-title-standin`, and drops the record's doors. The skeleton says it is still waiting after `SLOW_LOAD_NOTICE_MS` (6s) rather than shimmering silently (D5).
- **The header's action cluster is icons only, at every width.** `sm:` answers the VIEWPORT, not the 540px window, so a `sm:`-revealed uuid in the bar always overlapped the centred title (D4). The id and the type chip live in `DetailRecordMeta` at the top of the body; the name never steps aside (D2).
- **The docked presentation starts below the app shell header** because `SidePanelSurface` pads its fixed container — the class fix, for every panel built on that surface (D3).
- **The window and the docked panel are singletons, and they say what they closed.** `announceSingletonReplacement` (`features/window-panels/detail/singletonReplacement.ts`) names the replaced record with an Undo; never a silent swap (D8).
- **`/detail/**` is in `utils/auth/protected-routes.ts`** — a shared record link is a closed door for a guest, not a broken record (D7).
- **`check:settings-unregistered` will name `ui.detail.presentation_by_type`** until `migrations/detail_presentation_by_type_knob.sql` is applied — the guard doing its job. `ui.detail.default_presentation` is registered and live, so it will NOT be named.

---

## Related features

- Depends on: `@ai-matrx/associations` (cards, grid, `isEntityTypeToken`), `@ai-matrx/design-system`, host ports from `features/window-panels/detail/`, `lib/scoped-config`.
- Depended on by: `features/item-presentation` (`useOpenItemPresentation`), the `/detail` and `/demos/detail-primitive` surfaces.
- Cross-links: [`features/window-panels/FEATURE.md`](../../features/window-panels/FEATURE.md) § The Detail primitive; `common-docs/projects/google-native/PLAN.md` §5.1.

---

## Doctrine compliance

**Primitives reused** (searched before building): `WindowPanel` + window registry metadata + `lazyOverlay` + typed openers (window presentation, deep links); `SidePanelSurface` → `MatrxDynamicPanelHost` on react-resizable-panels v4 (docked presentation — found by searching `features/overlays/surfaces`, so no second docked panel was built); `RouteHeader` + `PageHeader` + `ChevronLeftTapButton` (page); `useUrlSync` / `UrlPanelManager` / `initUrlHydration` (deep links — no second URL mechanism); `lib/scoped-config/sessionKnob` (the knob read); `EntityDoorControls`, `MatrxUuidCell`, `tokenFromColumnName` / `isUuidValue` (doors); `AssociationCardGrid` + `PrimaryEntityProvider` (associations, as `PartyRecordPage` does); `public.version_list` (history, as the working document does); `NonEditableContextMenu` + `SurfaceRuntimeProvider` + the `matrx-user/item-detail` manifest (the item frame, moved verbatim); `useClippedContentGuard`; `toast`, `copyToClipboard`.

**Primitives introduced**
- `lib/detail/*` — Why new: nothing produced three presentations from one registration; seven bespoke `*DetailPanel.tsx` files and the generic `ItemDetailWindow` each hand-rolled chrome. Considered extending `ItemDetailWindow` — rejected: it was one presentation with the core and the chrome fused.
- `detailWindow` / `detailDocked` overlays — replace `itemDetailWindow` (deleted; no legacy).

---

## Change log

- 2026-09-17 — **F-5, the VERIFY-U-P1 repair.** D1 the page no longer `back()`s into an empty history (`canGoBack` / `toRecordHome` ports); D2 the header always names the record, chip and id move to `DetailRecordMeta`; D3 `SidePanelSurface` starts below the shell header; D4 the action cluster is icons only (the `sm:`-revealed uuid was the collision); D5 nothing is invented on a failed load and the skeleton has a bounded, honest wait; D6 the feature-visibility surface moved to `features/window-panels/detail/DetailShowcase.tsx` and is served at `/detail` in `(core)`; D7 `/detail/**` is a protected route; D8 the singleton names the record it closed, with an Undo. Arrows became the primary list binding (brackets are aliases); `DetailPresentationPane` gave `registerSave` its first caller and the knob its only writer; `ui.detail.presentation_by_type` implements the per-record-type override (file written, not applied — no DB egress in that session). Tests: `pnpm jest lib/detail features/window-panels/detail utils/auth/__tests__/detail-deep-links` — 6 suites, 27 tests. Also corrected in this file: the knob migration is APPLIED (it was recorded here as "written, not applied") and `check:settings-unregistered` will not name it.
- 2026-09-17 — Built. `ItemDetailWindow` migrated end to end (deleted; `resolveItemDetailType` + `ItemDetailFrame` carry its loader, fields, surface scope and right-click menu); `useOpenItemPresentation` routes non-bespoke types through `useOpenDetail`; `file`/`image`/`video`/`audio` gained a `detailSource` (`files.files`). Knob file `migrations/detail_presentation_knob.sql` written, not applied (the chair applies DB files). Demo `/demos/detail-primitive`.
