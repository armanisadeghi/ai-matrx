# Spaces — needs from outside the fence

Builder adds one row per need; the owner session clears it (adds it in the package) the same day and deletes the row.

| Need | Why (parity ID) | Where it belongs |
|---|---|---|
| A full-bleed workspace page-top template the Notion top bar can sit in (breadcrumb, edited-ago, Share, star, •••) | A6 — the template is "not yet a single component"; the bar is built inside the fence (`page/SpacePage.tsx` `.spaces-topbar`) under the shell header | `features/shell` page-top templates (owner: deferred to switch-over) |
| Popover menus with a solid surface option (Notion menus are opaque; our `PopoverContent` renders see-through) | A7, D5 — ••• menus read as glass over the cover | `@ai-matrx/design-system` Popover |
