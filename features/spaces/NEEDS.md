# Spaces — needs from outside the fence

Builder adds one row per need; the owner session clears it (adds it in the package) the same day and deletes the row.

| Need | Why (parity ID) | Where it belongs |
|---|---|---|
| A full-bleed workspace page-top template the Notion top bar can sit in (breadcrumb, edited-ago, Share, star, •••) | A6 — the template is "not yet a single component"; the bar is built inside the fence (`page/SpacePage.tsx` `.spaces-topbar`) under the shell header | `features/shell` page-top templates |
| A route opt-out that keeps the shell's chat/canvas column closed on `/spaces` | A8 — on load the shell opened its chat column beside the page and squeezed the 2-column layout | `features/shell` / canvas workspace route list |
| Spaces' own Cmd+K: a documented way for a route to own Cmd+K / Cmd+P instead of the global search | E1 — done meanwhile with a capture-phase listener that stops the global one while Spaces is mounted | shell global search shortcut |
| Popover menus with a solid surface option (Notion menus are opaque; our `PopoverContent` renders see-through) | A7, D5 — ••• menus read as glass over the cover | `@ai-matrx/design-system` Popover |
