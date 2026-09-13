# Settings primitives

Verified against code 2026-09-12.

These local primitives are the shared presentation contract for settings rows,
sections, controls, and settings navigation. Import the source component you
need; do not add a barrel or a page-local substitute.

## Composition

- Wrap a settings route or overlay in **`SettingsDesignProvider`** with
  `variant="compact"`. Embeddings that omit it retain the standard variant.
- Use **`SettingsPage`** as the centered content canvas. The shell owns the
  only scroll container.
- Use **`SettingsGroup`** or `SettingsSection` for related rows. Their props
  are identical; `SettingsGroup` is the named composition recipe.
- Use **`SettingsNavigationRow`** for one destination. Pass `href` for native
  link and modifier-click behavior, or `onNavigate` for an in-place action.
  The two are deliberately exclusive.
- Use **`SettingsFlatNavigation`** with **`settingsNavigationSections`** for
  desktop and overlay settings menus. It renders optional muted headings and
  aligned flat links; it never owns accordion state or recursive indentation.
  Adjacent root leaves form one unheaded group in registry order. Separated
  groups use stable IDs based on their first leaf, so React keys stay unique.
- Use **`SettingsNavigationSearch`** for the visible search input. Callers own
  query state and may supply exact-control results from their route adapter;
  results include their destination location and must suppress a competing
  no-results message. Both navigation primitives own their Tailwind structural
  and semantic styling, so they remain correct outside a route shell. Its
  `renderItem` callback returns one native `a` or `button` root; the primitive
  supplies the compact row inset and active state through that direct child.

## Row and control rules

- Controls compose **`SettingsRow`**. Keep their flat public APIs; add a
  variant here instead of styling a caller.
- Compact descriptions remain one desktop line. The accessible `About <label>`
  info icon exposes the full description and `helpText` on click; warnings and
  errors always wrap.
- Input ids use React `useId`; `SettingsRow` owns a separate stable anchor
  from its nearest `SettingsSection` title and label. Use
  `settingsControlSearchId(sectionTitle, label)` for an exact `?control=` link.
- `scripts/generate-static-settings-control-index.ts` catalogs only registry
  tabs and literal `Settings*` labels. Dynamic labels or group titles are
  excluded rather than guessed; regenerate after an authored static control changes.
- Large controls stack below their label on narrow screens. Action targets are
  at least 44px tall on touch layouts.

## Change Log

- 2026-09-12: Added flat navigation and shared search primitives for route and
  overlay menus, including stable unheaded root groups, exact-control result adapters,
  and work-on-import structural styling.
- 2026-09-12: Added compact presentation context, page/group/navigation
  compositions, responsive row behavior, stable ids, and accessibility rules.
- 2026-09-12: Kept compact disclosure out of the row flow until requested.
- 2026-09-12: Added generated static-control deep links and portal-backed
  compact help; collapsible headers are keyboard buttons with separate actions.
