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

## Row and control rules

- Controls compose **`SettingsRow`**. Keep their flat public APIs; add a
  variant here instead of styling a caller.
- Compact descriptions remain one desktop line. The explicit `About <label>`
  disclosure exposes the full description and `helpText`; warnings and errors
  always wrap.
- Generated control ids use React `useId`; pass `id` only when a durable
  external target is required.
- Large controls stack below their label on narrow screens. Action targets are
  at least 44px tall on touch layouts.

## Change Log

- 2026-09-12: Added compact presentation context, page/group/navigation
  compositions, responsive row behavior, stable ids, and accessibility rules.
