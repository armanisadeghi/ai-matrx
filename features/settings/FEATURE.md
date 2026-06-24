# FEATURE.md — `settings`

**Status:** `active`
**Tier:** `1`
**Last updated:** 2026-06-15

---

## Purpose

The single user-facing surface for every preference in the app — a VS Code-style window with a hierarchical tree on desktop and an iOS-style push-nav drawer on mobile. Every preference across every Redux slice (`userPreferences`, `theme`, `adminPreferences`, `layout`, `windowManager`) is read and written through one unified hook (`useSetting`) and composed from one tightly controlled set of primitives. No tab imports Redux directly; no tab imports shadcn directly.

---

## Entry points

**Routes**
- `app/(authenticated)/settings/preferences/page.tsx` — legacy URL kept alive as a redirect. Dispatches `openOverlay({ overlayId: "userPreferencesWindow", data: { initialTabId } })` and forwards to `/dashboard`. Legacy `?tab=` values are aliased to new registry ids.
- `app/(authenticated)/settings-shell-demo/page.tsx` — dev demo page with Open Settings button + admin-view toggle.
- `app/(authenticated)/settings-primitives/page.tsx` — primitive gallery (every control, every state).
- `app/(authenticated)/settings-tree-demo/page.tsx` — tree + drawer-nav demo with a fake 20-node tree.
- `app/(authenticated)/settings-hooks-demo/page.tsx` — `useSetting` across 3 slices.

**Overlay ids** (dispatched via `openOverlay(...)`)
- `userPreferencesWindow` — canonical. Every caller should use this one.
- `userPreferences` — legacy modal id. Resolves to the same shell via `SettingsShellOverlay`.

**Hooks**
- `useSetting<T>(path)` — read/write any setting. `[value, setter]`. Throws at init if the path's slice isn't registered.
- `useSettingPersistence(path)` — returns `"synced" | "local-only" | "session"` for surfacing badges.
- `useSettingsSearch(query, { isAdmin })` — ranked hits (label > keyword > description).
- `usePreferencesModal()` — Phase 8 shim, same API as the deleted legacy hook but dispatches into overlaySlice.
- `useSettingsPresentation()` — returns `{ presentation: "route" | "window" | "drawer", closeShell?, setActiveTabId? }`. Defaults to `"route"` outside a provider, so route pages "just work."
- `useSettingsNavigate()` — returns `(href, event?, options?)`. Smart navigation that closes the shell first when called from inside the window/drawer; in route mode it's a plain `router.push`. Cmd/Ctrl/Shift/middle-click always opens a new tab and leaves the shell open.
- `useSettingsTabNavigate()` — switches the active settings tab in-place inside the shell; falls back to `/settings/preferences?tab=…` (or a custom href) on a route.

**Public API** — `@/features/settings`
- `SettingsShell`, `SettingsShellOverlay`, `SettingsTabHost`
- `useSetting`, `useSettingPersistence`, `useSettingsSearch`, `countSearchHits`
- `settingsRegistry`, `getVisibleTabs`, `getTabTree`, `getTabTreeNodes`, `findTab`
- `parseSettingsPath`, `getSliceBinding`, `sliceBindings`
- Types: `SettingsPath`, `SettingsPersistence`, `SettingsTabDef`, `ResolvedSettingsTab`, `SettingsSearchHit`, `SliceBinding`

**Presentation-aware nav** — `@/features/settings/components/SettingsPresentationContext` (imported directly; not re-exported through the barrel because barrels are being eliminated)
- `SettingsPresentationProvider` (provider)
- `useSettingsPresentation`, `useSettingsNavigate`, `useSettingsTabNavigate`
- Types: `SettingsPresentation`, `SettingsPresentationContextValue`, `SettingsNavigateOptions`

**Primitives** — `@/components/official/settings`
- Form: `SettingsSwitch`, `SettingsSelect`, `SettingsSlider`, `SettingsNumberInput`, `SettingsTextInput`, `SettingsTextarea`, `SettingsRadioGroup`, `SettingsCheckbox`, `SettingsSegmented`, `SettingsColorPicker`, `SettingsMultiSelect`, `SettingsButton`, `SettingsLink`, `SettingsKeybinding`, `SettingsModelPicker`
- Layout: `SettingsSection`, `SettingsSubHeader`, `SettingsCallout`, `SettingsGrid`, `SettingsReadOnlyValue`
- Tree: `SettingsTree`, `SettingsDrawerNav`, `SettingsBreadcrumb`
- Shared types: `SettingsBadge`, `SettingsCommonProps`, `SettingsRowVariant`, `SettingsRowDensity`, `SettingsControlSize`, `SettingsOption`, `SettingsTreeNode`

**Redux slice(s) exposed through `useSetting`**
- `userPreferences` (`lib/redux/preferences/userPreferencesSlice.ts`) — 20 modules (incl. `favorites` — user-curated pins, capped at `FAVORITES_MAX`, mutated via dedicated `addFavorite`/`removeFavorite`/`toggleFavorite`/`reorderFavorites` reducers); persistence: **synced** (warm-cache: IDB + localStorage + Supabase).
- `theme` (`styles/themes/themeSlice.ts`) — `{ mode: "light" | "dark" }`; persistence: **synced** (boot-critical: pre-paint localStorage).
- `adminPreferences` (`lib/redux/slices/adminPreferencesSlice.ts`) — server override; persistence: **local-only** (flagged for sync migration).
- `layout` (`lib/redux/slices/layoutSlice.ts`) — layoutStyle + isInWindow; persistence: **local-only** (flagged for sync migration).
- `windowManager` (`lib/redux/slices/windowManagerSlice.ts`) — action-only writes (`toggleHidden`, `restoreAll`); persistence: **session**.

---

## Data model

**Database tables** (Supabase)
- `user_preferences` — single JSONB blob per user, mutated through the userPreferences warm-cache sync policy. This feature doesn't touch the table directly; the sync engine owns the fetch/write contract.

**Key types**
- `SettingsTabDef` (`features/settings/types.ts`) — registry entry shape.
- `SliceBinding` (`features/settings/slice-bindings.ts`) — per-slice `{ read, write, persistence }` contract.
- `SettingsTreeNode` (`components/official/settings/tree/types.ts`) — tree rendering node.

---

## Key flows

### 1. User clicks "Open settings" (or any entry point that dispatches the overlay)

Trigger: `dispatch(openOverlay({ overlayId: "userPreferencesWindow", data?: { initialTabId? } }))`.

Path:
- `UnifiedOverlayController` iterates `ALL_WINDOW_REGISTRY_ENTRIES`, renders one `<OverlaySurface>` per entry.
- `OverlaySurface` for `userPreferencesWindow` reads its `isOpen` from `overlaySlice`, lazy-loads `componentImport`, and mounts the resolved component with `{ isOpen: true, onClose, ...data }`.
- The resolved component is `SettingsShellOverlay` (Phase 8), which ignores the passed props and reads `overlaySlice` directly so it also catches the legacy `userPreferences` modal id.
- The overlay adapter computes `initialTabId` (remapping legacy tab ids when needed) and renders `<SettingsShell isOpen initialTabId isAdmin onClose />`.
- On desktop: `SettingsShell` renders a `WindowPanel` with `<SettingsTree>` in the sidebar and `<SettingsTabHost>` in the body.
- On mobile (`useIsMobile()` → true): `SettingsShell` mounts `<SettingsDrawerNav>` instead — iOS-style push-nav.

Exit: `SettingsShell.onClose` dispatches `closeOverlay` for both ids; `OverlaySurface` unmounts; lazy-loaded tabs stay in the React.lazy module cache for fast reopen.

### 2. User toggles a preference

Trigger: a primitive's `onValueChange` inside a tab calls `setter(v)` from `useSetting(path)`.

Path:
- `useSetting` parses the path (`parseSettingsPath`), looks up the slice binding (`getSliceBinding`), and dispatches `binding.write(key, value)`.
- For `userPreferences.*`, the write resolves to `setPreference({ module, preference, value })` — the warm-cache sync policy's middleware picks it up, debounces ≤250ms, and writes to IDB + localStorage mirror + Supabase.
- For `theme.mode`, the write is `setMode(value)` — boot-critical middleware synchronously writes to localStorage and broadcasts across tabs.
- For `adminPreferences.*` / `layout.*`, the write goes to Redux only — no persistence tier yet (flagged for migration).

Exit: Every subscribed component re-renders on the slice update; the sync engine's debounced write flushes in the background.

### 3. Deep link: `/?panels=user_preferences`

Trigger: browser navigates to any URL containing `?panels=user_preferences` on mount.

Path:
- `initUrlHydration` registers a `user_preferences` hydrator that dispatches `openOverlay({ overlayId: "userPreferencesWindow" })`.
- The rest of the flow matches Flow 1.

Exit: Window opens at the default tab. If additional query params (e.g. `&user_preferences_id=…`) are present, the registry's `urlSync.key` + `instanceId` wiring applies.

### 4. Adding a new tab (developer flow)

Trigger: Developer adds a new setting.

Path:
1. Decide where the value lives. Existing slice → use `useSetting("slice.key")`. New preference → add to `UserPreferences` types + defaults + reducer, the sync engine picks it up automatically. Genuinely new slice → add a binding in `features/settings/slice-bindings.ts`.
2. Create `features/settings/tabs/MyTab.tsx` composing ONLY primitives from `@/components/official/settings`. No Redux imports. No shadcn imports. No `className` on primitives.
3. Add a registry entry in `features/settings/registry.ts` with `{ id, label, icon, parentId?, component: lazyTab(...), persistence }`.
4. Done. The tree, breadcrumb, search, and admin gating pick it up automatically.

---

## Invariants & gotchas

- **Primitives have no `className` prop.** Ever. Variations must be new enum values on existing props. If you need a visual variation that isn't supported, add a prop to the primitive — don't pass `className`.
- **Tabs never import Redux.** They can call `useSelector` only for *read-only derived state that isn't a preference* (e.g. in `WindowsTab` where open-window counts come directly from `windowManager.windows`). For anything writable, `useSetting` is the only path.
- **Tabs never import shadcn.** All form controls come from `@/components/official/settings`. The one documented exception is `AiModelsTab`, which lazy-wraps the legacy `AiModelsPreferences` until a `SettingsModelList` primitive exists.
- **`useSetting` throws at init when the slice isn't bound.** Treat that as a "fix your slice binding" signal, not a caller bug. Add to `slice-bindings.ts`.
- **Any in-shell component that pushes a route MUST go through `useSettingsNavigate()` (or `useSettingsTabNavigate()` for tab switches).** Calling `router.push("/somewhere")` directly inside a tab silently dismisses the settings window and yanks the user out of the surface — the shell isn't aware the route changed, the overlay just blinks out and the new page renders bare. Cmd/Ctrl/middle-click "open in new tab" must keep working; the hook handles it. `SettingsLink`, `OrganizationCard`, and `UserContentTemplateManager` are the reference consumers. The Boy-scout rule applies: if you encounter a stray `router.push` inside a settings-mounted component while working in a file, route it through the hook in the same change.
- **Writing through `useSetting` for `windowManager` requires an action-only key.** `toggleHidden`, `restoreAll` — no `read` roundtrip. For the full `minimizeAll(payload)` write you need viewport dims, so call `useAppDispatch()` directly with `minimizeAll(...)` (see `WindowsTab`).
- **`persistence: "local-only"` and `persistence: "session"` are flags, not final states.** They document which slices still need a sync policy.
- **The legacy `userPreferences` modal overlay id still resolves to the new shell.** Kept so nothing downstream has to change. Remove the modal registry entry once every caller has migrated to `userPreferencesWindow`.
- **Do NOT regress on `components/user-preferences/AiModelsPreferences.tsx`.** It's kept on purpose — it's the only remaining legacy `*Preferences.tsx` still referenced (by `AiModelsTab`). Deleting it breaks the shell.
- **Category tabs (e.g. `id: "general"`, `id: "ai"`) have `component: Placeholder`.** The tree's folder nodes only expand/collapse, they don't activate. The placeholder is never rendered for them; it's still required to satisfy the type.

---

## Related features

- **Depends on:**
  - `features/window-panels` — `WindowPanel`, `UnifiedOverlayController`, `OverlaySurface`, `windowRegistry`.
  - `lib/redux/slices/overlaySlice` — open/close dispatching.
  - `lib/redux/preferences/userPreferencesSlice` — primary write target.
  - `lib/sync/*` — warm-cache + boot-critical persistence engine.
  - `components/official/settings/*` — primitives library.
- **Depended on by:**
  - Every feature that surfaces a user preference (messaging, voice, coding, flashcards, …).
  - `hooks/user-preferences/usePreferencesModal.ts` (Phase 8 shim).
  - `hooks/user-preferences/usePreferenceValue.ts` (Phase 8 shim).
- **Cross-links:**
  - `features/window-panels/FEATURE.md`
  - `.cursor/skills/ios-mobile-first/SKILL.md`
  - `.cursor/skills/settings-system/SKILL.md`

---

## Current work / migration state

Phase 1–8 shipped. Phase 9 (this doc + skill) closes the original project.

**Follow-up candidates** (not blocking):
- Migrate `adminPreferences`, `layout`, and the email-preferences API to the sync engine so those tabs can drop their `local-only` flag.
- Build a `SettingsModelList` primitive and replace the legacy `AiModelsPreferences` wrapper.
- Reintroduce `AgentContextPreferences` as a proper tab built on the new agent system.
- Reassess `general.notifications` aliasing to `MessagingTab` once a dedicated Notifications preferences module exists.

---

## Change log

- `2026-06-24` — **Favorites module.** Added the `favorites` module to `userPreferences` (`{ items: FavoriteItem[] }`, capped at `FAVORITES_MAX=50`, synced) with dedicated dedupe/cap reducers and `usePinned`/`<PinButton>` (`components/favorites/`). Powers the dashboard "Pinned" grid and the sidebar `FavoritesNavGroup`. See `features/dashboard/FEATURE.md`. No settings tab yet — pins are managed inline (PinButton / unpin), not via the settings shell.
- `2026-06-15` — **Conversation filters tab.** Added the `conversationFilters` module to `userPreferences` (`{ surfaces: Record<surfaceId, { includeFeatures, includeApps, includeEmptySource }> }`, synced) and a lazy `ConversationFiltersTab` (`features/settings/tabs/ConversationFiltersTab.tsx`) registered under **General** (`id: general.conversationFilters`). It lets the user edit the default `source_app`/`source_feature` ALLOW-list each filterable surface (`chat`, `code`, `history-window`) shows, composing only `SettingsMultiSelect` / `SettingsSwitch` / `SettingsButton`. Note: `useSetting` only nests two levels (`module.preference`), so the tab reads/writes the entire `conversationFilters.surfaces` map and patches per-surface entries in place. Feeds the `conversation-history` source-filter tree (see `features/agents/components/chat/FEATURE.md`).
- `2026-05-13` — **Presentation-aware navigation.** Added `SettingsPresentationContext` + `useSettingsPresentation` + `useSettingsNavigate` + `useSettingsTabNavigate` in `features/settings/components/SettingsPresentationContext.tsx`. `SettingsShell` now wraps its tree with `<SettingsPresentationProvider presentation="window"|"drawer">` so descendants can do the right thing instead of unconditionally `router.push`-ing and silently dismissing the shell. Reference consumers updated: `components/official/settings/primitives/SettingsLink` (internal hrefs route through the hook; external links and Cmd/Ctrl/middle-click "open in new tab" still work), `features/organizations/components/OrganizationCard` (was the worst offender — every card click pushed straight to `/organizations/{id}/settings` and dismissed the window), `features/content-templates/components/UserContentTemplateManager` (four `router.push` calls to `/settings/content-templates/…`). New invariant added in this doc.
- `2026-04-25` — Internal imports no longer use `features/settings/index.ts`; consumers use `hooks/useSetting`, `hooks/useSettingsSearch`, `registry`, `components/SettingsShell`, etc. Barrel file kept for now.
- `2026-04-23` — Phase 1–9 initial migration shipped.
  - 20 primitives + 3 tree components under `@/components/official/settings`.
  - `useSetting(path)` + 5 slice bindings; registry of 30+ tabs.
  - `SettingsShell` + `SettingsShellOverlay` mounted via `WindowPanel` on desktop, Vaul drawer push-nav on mobile.
  - Every legacy `components/user-preferences/*.tsx` deleted except `AiModelsPreferences` and `StandalonePromptsPreferences`.
  - `/settings/preferences?tab=X` kept alive as redirect; `usePreferencesModal` and `usePreferenceValue` shimmed.
  - Follow-on work flagged in registry via the `persistence` field.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log. Stale FEATURE.md cascades across parallel agents. Treat doc updates with the same weight as code changes in the same PR.
