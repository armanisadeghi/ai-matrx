# MatrxDynamicPanel — resizable floating panel chrome

Desktop side/top/bottom floating panel with drag-resize, dock reposition, and
fullscreen. Hosted through `MatrxDynamicPanelHost` (portal + dialog chrome) for
almost every product caller; a few surfaces import the panel directly.

## Avatar cover (shell user menu)

`MatrxDynamicPanel` portals into `#glass-layer` at `z-[100]`. The shell header
lives inside `.shell-root` (`position: fixed`), a lower stacking context — so
header `z-index` and panel `pr-10` cannot keep the avatar visible or clickable.

**Automatic fix (no caller opt-in):**

1. When an expanded panel covers the top-right corner (right dock, top dock,
   fullscreen, or mobile full-bleed), it **claims**
   `claimDynamicPanelAvatarCover()` (refcount in `elevatedShellUserMenuStore.ts`).
2. `ElevatedShellUserMenuRoot` (mounted once in `AppShell` → `GlassPortal`)
   renders a glass-layer avatar + menu at `z-110+`.
3. CSS hides `.shell-header .shell-user-menu-wrapper` while
   `html[data-dynamic-panel-avatar-cover="true"]`.
4. The elevated chrome reuses AppShell’s `#shell-user-menu` checkbox so every
   menu item that closes via `htmlFor="shell-user-menu"` still works.

Left/bottom desktop docks do not claim — they leave the avatar corner free.
Panel header keeps `pr-10` on right dock so panel controls clear the stand-in.

## Entry points

| File | Role |
|---|---|
| `MatrxDynamicPanel.tsx` | Panel primitive; claims avatar cover |
| `MatrxDynamicPanelHost.tsx` | Portal host + dialog labeling + focus |
| `ElevatedShellUserMenu.tsx` | Glass-layer avatar stand-in (singleton root) |
| `elevatedShellUserMenuStore.ts` | Refcount + `data-dynamic-panel-avatar-cover` |

## Change log

- `2026-07-16` — **Avatar cover:** automatic elevated shell user menu while a
  right/top/fullscreen/mobile dynamic panel would bury the header avatar.
  Mirrors the Canvas pane pattern; callers unchanged.
