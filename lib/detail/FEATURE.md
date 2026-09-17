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
- `useDetailCore(data, presentation, { onClose? })` (`core/useDetailCore.ts`) — the core as state. `onClose` is for the in-place presentations; the page needs none and is left through `core.leave` (D1).
- `useDetailKeyboard` — Escape · `[` / `]` always · ArrowUp/Down/Left/Right when the body is not the scroll target · Cmd/Ctrl+Enter.
- `useDetailHost` / `DetailHostProvider` (`host.tsx`) — the ports.
- `savePresentation` (`features/window-panels/detail/savePresentation.ts`) — THE write port bound by `DetailHost`; a per-type save (and its removal) goes through `setUserKnobMapEntry` (`lib/scoped-config/service.ts`).
- `trimListContext` (`listContext.ts`) — the list context capped before it rides a URL (NEW-7).

**Components**
- `DetailWindowPresentation` · `DetailDockedPresentation` · `DetailPagePresentation` (`presentations.tsx`).
- `DetailTitle` · `DetailActions` · `DetailRecordMeta` (`core/DetailHeader.tsx`) · `DetailBody` (`core/DetailBody.tsx`) · `DetailPresentationPane` (`core/DetailPresentationPane.tsx`).

**The one singleton opener**
- `openDetailSingleton` (`features/window-panels/detail/openDetailSingleton.ts`) — the ONLY place `detailWindow` / `detailDocked` are opened. Both opener hooks and the `?panels=` hydrator go through it, which is what makes the replacement announcement impossible to forget (D8).

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
- `platform.feature_knob` row `ui.detail` / `presentation_by_type` — THE per-record-type override, a json map `{"file":"docked"}` on the same organization → user ladder, read before the default for the type being opened. `migrations/detail_presentation_by_type_knob.sql`, **APPLIED and live** (chair, 2026-09-17 16:16Z, through the sanctioned path with a ledger row; json, org- and user-overridable). Were it ever missing, `knob_resolve` raises for the key by design, `DetailHost` catches that, warns once per tab naming the file, and the default answers.
- `platform.feature_knob` row `ui.detail` / `list_context_max_ids` — how many records of the opening list may ride the page presentation's URL (integer, default 200, 10–2000, **organization**-overridable). `migrations/detail_list_context_max_knob.sql`, **written 2026-09-17, NOT applied** (the chair applies DB files). Until it is, `knob_resolve` raises for the key, `getSessionKnob` logs it and answers `undefined`, and `detailListContextMax` uses the module default of 200 — the cap is never absent, only unconfigurable.
- `public.version_list(p_token, p_id)` — the history section (`history.row_versions`, viewer-gated).
- The record itself — whatever the registration's `load` reads (item-presentation: the registry's `detailSource`, RLS).

**Key types** (`types.ts`): `DetailPresentation`, `DetailRecordType`, `DetailField`, `DetailSourceHealth`, `DetailListContext`, `DetailInstanceData`, `DetailHistoryEntry`.

---

## Key flows

1. **A card is clicked.** `useOpenItemPresentation` → `useOpenDetail()({ type, id, seed })` → `host.resolvePresentation` (cached knob; RAISES when unregistered → toast + window) → `host.open({ presentation, data })` → opener dispatches `openOverlay("detailWindow" | "detailDocked")`, or `router.push("/detail/<type>/<id>")` for `page`.
2. **The overlay renders.** `OverlayController` block → lazy `DetailWindow` → `<DetailHostProvider ports={{ resolveType, shells: { Window } }}>` → `DetailWindowPresentation` → `useDetailCore`: `resolveType(type)` (item-presentation registry) → `useDetailRecord` (abortable load) → title/fields/health → shell slots filled → `DetailBody` sections.
3. **Switch presentation from inside, or leave the page.** `DetailActions` → `core.switchTo("docked")` → `host.open(docked)` then `host.close(window)`. Leaving the page — the Back chevron, Escape, or a switch — is ONE exit, `core.leave`: `host.navigate.canGoBack(ref)` decides, `back()` only when THIS tab pushed the page itself, otherwise `toRecordHome` replaces it with the record's own route (or `/dashboard`). Never a bare `back()`, and never an exit passed in by a route (D1 twice).
4. **Deep link.** `?panels=detail:task.<id>:as-docked` → `UrlPanelManager` → hydrator `detail` → `openDetailSingleton` → `openOverlay("detailDocked")`; the mounted shell re-registers the same token (`useUrlSync` / `WindowPanel` urlSync props) so the URL round-trips. A link naming two records announces the one it closed, like every other opener (D8).
5. **`[` / `]`, and the arrows.** `useDetailKeyboard` on the presentation root → `core.list.next()` → `host.open` with `list.index + 1` (singleton retargets) or `toPage(next, { list })`. The arrows do this only when the body is not scrollable; when it is, they scroll it (NEW-5).
6. **The setting is changed — or taken back — from the record.** `DetailPresentationPane` at the foot of every detail → `host.savePresentation({ presentation, forType })` → `platform.knob_override_set` at the person's rung. `forType` changes ONE entry of the per-type map through `setUserKnobMapEntry`: the door replaces the whole json value, so the write re-reads the ladder first (past the 60s cache) and **REFUSES, with the sentence the pane renders, when the current map cannot be read** — a failed read merged into `{}` wrote a one-entry map over every other type the person had set (Bugbot, frontend PR 228). "Use the default for <type> records" removes that entry through the same primitive with the key absent, clearing the whole override row when it was the last one (NEW-2); when the exception is the ORGANIZATION's, the pane says so and claims no save. It registers `core.keyboard.registerSave` while open, so Cmd/Ctrl+Enter saves it — the chord's only caller until a record type ships an editable body.

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
- **Only `ready` is a loaded row, and a load that is not one invents NOTHING.** The title comes from the loaded row or the seed; with neither it says what is happening, sets `data-detail-title-standin`, and drops the record's doors. `status: "none"` — a type with no `detailSource`, which every unregistered type resolves to — is the ABSENT state, not a successful load: it names the type, says no detail is registered for it, shows no doors and invents no name, and the body names the remedy (D5 + NEW-1; treating `none` as loaded is what put `Untitled File` and a full set of doors over "no details available"). The skeleton says it is still waiting after `SLOW_LOAD_NOTICE_MS` (6s) rather than shimmering silently.
- **The header's action cluster is icons only, at every width, AND the title is laid out in the same flex row as the actions.** `sm:` answers the VIEWPORT, not the 540px window, so a `sm:`-revealed uuid in the bar always overlapped the centred title (D4). The id and the type chip live in `DetailRecordMeta` at the top of the body; the name never steps aside (D2). `WindowPanel` drew an OPEN window's title in an `absolute inset-x-0 … px-16` layer with no gap reserved for the action zone, so a long name ran under the icons whatever the detail did — it is now a `min-w-0 flex-1` flex child that truncates instead (D4/NEW-4, geometric, NO SCREEN WAS SEEN). `SidePanelSurface`'s `PanelHeader` wraps: the name and the close control hold the first line and the action cluster takes a second one when it does not fit, because under `pointer: coarse` the cluster is ~300px of a 390px phone drawer (NEW-4).
- **The docked presentation starts below the app shell header** because `SidePanelSurface` pads its fixed container with `var(--shell-header-h, 0px)` — the class fix, for every panel built on that surface (D3). `--shell-header-h` (2.75rem) is the ONE token for that height; `--header-height` (2.5rem) is the pre-shell ResponsiveLayout token, and padding with it left the panel 4px over the header's right-hand cluster. The admin tree's 2.5rem is declared ONCE, on `<body>`, because the panel is portaled into `#glass-layer` outside `.shell-root`.
- **The window and the docked panel are singletons, they say what they closed, and there is exactly ONE opener.** `openDetailSingleton` is the only place either overlay is opened — both opener hooks and the `?panels=` hydrator go through it — and it calls `announceSingletonReplacement` (`singletonReplacement.ts`), which names the replaced record with an Undo. Round 1 put the announcement in the two opener hooks, and the hydrator (a third opener nobody remembered) replaced records in silence on the very path D8 was found on (D8, twice). A literal `openOverlay({ overlayId: "detailWindow" … })` anywhere else is a second opener, and a census test fails on it.
- **`/detail/**` is in `utils/auth/protected-routes.ts`** — a shared record link is a closed door for a guest, not a broken record (D7).
- **The list context is CAPPED before it rides a URL.** `encodeListQuery` trims to `ui.detail.list_context_max_ids` (default 200) around the current record and marks the URL `&lt=<total>`; `DetailRecordMeta` then says how many of how many records the arrows can reach. Uncapped, a 500-row list produced a >20 KB href no server accepts (NEW-7). The cap is a knob because every ceiling here is a knob; `lib/detail` never reads the ladder — the host resolves it and passes the number in.
- **Escape closes from any control inside the detail** except a select / open menu / combobox and a text field with uncommitted edits (`value !== defaultValue`). `isTypingTarget` is still the rule for the ARROWS — a caret belongs to the field — but it swallowed Escape on the presentation pane's checkbox (NEW-6).
- **A per-type save is a MERGE AT THE PERSON'S OWN RUNG that can refuse.** `ui.detail.presentation_by_type` holds every type's exception in one json map and the write door replaces the whole value, so `savePresentation` never merges into a guess: an unreadable map refuses the write and the pane shows the refusal (`data-detail-presentation-refusal`). The base is the USER rung's own map, read through `platform.knob_override`, NEVER the effective (organization → user) answer — merging the effective map and writing it at the user rung copied the organization's exceptions into the person's row, where they stopped tracking the organization for ever (NEW-3).
- **`check:settings-unregistered` names neither `ui.detail.presentation_by_type` nor `ui.detail.default_presentation`** — both knob rows are registered and live (`migrations/detail_presentation_knob.sql`, `migrations/detail_presentation_by_type_knob.sql`, both ledgered 2026-09-17). It WILL name `ui.detail.list_context_max_ids` until `migrations/detail_list_context_max_knob.sql` is applied: that is the guard doing its job, and the read is written to survive it (module default 200).

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

- 2026-09-17 — **F-11, the VERIFY-U-P1-R2 repair (round 2).** (1) D1 again: the page's Back chevron and Escape called `router.back()` raw on a pasted or bookmarked link — leaving the page is now `core.leave` inside the primitive and `DetailPagePresentation` takes no `onBack`. (2) D5/NEW-1: `status: "none"` is no longer treated as a loaded row — it names the type, says no detail is registered, shows no doors and invents no name. (3) D8 again: `openDetailSingleton` is the ONE place either singleton is opened; both opener hooks and the `?panels=` hydrator go through it, and a census test refuses a second opener. `PanelHydrateCallback` now honestly types the app's own dispatch (thunks included). (4) NEW-3: `setUserKnobMapEntry` merges the USER RUNG's own map (read through `platform.knob_override`), not the effective org→user answer, so an organization's exceptions keep flowing through the ladder. (5) NEW-2: the pane offers "Use the default for <type> records", a removal through the same primitive with the key absent (last entry clears the row); when the exception is the organization's it says so and claims nothing. (6) NEW-5: the arrows move between records only when the detail body is not the scroll target — when it is, they scroll and `[` / `]` still move. (7) NEW-6: Escape closes from any control inside the detail except an open menu/select or a text field with uncommitted edits. (8) NEW-7: the list context is capped by the new knob `ui.detail.list_context_max_ids` (file written, NOT applied), the URL carries the window around the current record with `&lt=<total>`, and the detail says the list was trimmed. (9) D4/NEW-4: `WindowPanel` lays an open window's title out in the same flex row as its action zones (`min-w-0 truncate`) instead of an `absolute inset-x-0 px-16` layer, and `SidePanelSurface`'s `PanelHeader` wraps so a phone keeps the record's name — both GEOMETRIC, **NO SCREEN WAS SEEN**, guarded by structure in jsdom. Every item was reproduced red on the round-2 head before the fix. Tests: `npx jest lib/detail features/window-panels/detail features/overlays lib/scoped-config utils/auth/__tests__/detail-deep-links` — 18 suites, 93 tests.
- 2026-09-17 — Chair correction: `ui.detail.presentation_by_type` is APPLIED and live (16:16Z); two sentences above said otherwise.
- 2026-09-17 — **F-9, the Bugbot findings on frontend PR 228 (commit `4cbd9e45`).** (1) `SidePanelSurface` reserved `--header-height` (2.5rem) under a `--shell-header-h` header (2.75rem), so D3's fix still left the docked panel 4px over the shell header's org switcher, search and avatar. It now reserves `var(--shell-header-h, 0px)`, and the admin tree's 2.5rem moved from `.shell-root[…]` to `body:has(.shell-root[…])` so ONE declaration reaches both the shell subtree and the `#glass-layer` the panel is portaled into. jsdom cannot lay out, so the guard asserts the declared chain — NO SCREEN WAS SEEN for it. (2) `savePresentation` moved out of `DetailHost` into its own module, and the per-type map write became `setUserKnobMapEntry` in `lib/scoped-config/service.ts`: a failed read of `ui.detail.presentation_by_type` used to be treated as an empty map, so one transient miss — or two tabs saving two types — rewrote the whole override and dropped every other type. A failed read now REFUSES the write and the pane renders the sentence, the base is re-read past the 60s cache, and a non-map value refuses rather than being overwritten. Both guards proven failing-then-passing against the pre-fix bytes. Tests: `npx jest lib/detail features/window-panels/detail features/overlays lib/scoped-config` — 14 suites, 57 tests.
- 2026-09-17 — **F-5, the VERIFY-U-P1 repair.** D1 the page no longer `back()`s into an empty history (`canGoBack` / `toRecordHome` ports); D2 the header always names the record, chip and id move to `DetailRecordMeta`; D3 `SidePanelSurface` starts below the shell header; D4 the action cluster is icons only (the `sm:`-revealed uuid was the collision); D5 nothing is invented on a failed load and the skeleton has a bounded, honest wait; D6 the feature-visibility surface moved to `features/window-panels/detail/DetailShowcase.tsx` and is served at `/detail` in `(core)`; D7 `/detail/**` is a protected route; D8 the singleton names the record it closed, with an Undo. Arrows became the primary list binding (brackets are aliases); `DetailPresentationPane` gave `registerSave` its first caller and the knob its only writer; `ui.detail.presentation_by_type` implements the per-record-type override (file written, not applied — no DB egress in that session). Tests: `pnpm jest lib/detail features/window-panels/detail utils/auth/__tests__/detail-deep-links` — 6 suites, 27 tests. Also corrected in this file: the knob migration is APPLIED (it was recorded here as "written, not applied") and `check:settings-unregistered` will not name it.
- 2026-09-17 — Built. `ItemDetailWindow` migrated end to end (deleted; `resolveItemDetailType` + `ItemDetailFrame` carry its loader, fields, surface scope and right-click menu); `useOpenItemPresentation` routes non-bespoke types through `useOpenDetail`; `file`/`image`/`video`/`audio` gained a `detailSource` (`files.files`). Knob file `migrations/detail_presentation_knob.sql` written, not applied (the chair applies DB files). Demo `/demos/detail-primitive`.
