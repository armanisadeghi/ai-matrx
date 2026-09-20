# MatrxDynamicPanel — resizable floating panel chrome

Desktop side/top/bottom floating panel with drag-resize, dock reposition, and
fullscreen. Hosted through `MatrxDynamicPanelHost` (portal + dialog chrome) for
almost every product caller; a few surfaces import the panel directly.

## Avatar cover (shell user menu)

`MatrxDynamicPanel` portals into `#glass-layer` at `z-[100]`. The shell header
lives inside `.shell-root` (`position: fixed`), a lower stacking context — so
header `z-index` and panel `pr-10` cannot keep the avatar visible or clickable.

**Since 2026-09-19 there is nothing to cover.** The profile menu left the
header for the bottom-left `ShellUserBlock`
(`features/shell/components/user-block/`), which no panel dock covers, so the
glass-layer avatar stand-in, its refcount store and the
`data-dynamic-panel-avatar-cover` CSS were deleted with it. A panel that docks
right/top or goes fullscreen now claims nothing.

## Entry points

| File | Role |
|---|---|
| `MatrxDynamicPanel.tsx` | Panel primitive |
| `MatrxDynamicPanelHost.tsx` | Portal host + dialog labeling + focus |

## Change log

- `2026-09-19` — **Avatar cover retired.** The shell profile menu moved bottom-left (`ShellUserBlock`); `ElevatedShellUserMenu.tsx`, `elevatedShellUserMenuStore.ts` and the panel's `claimDynamicPanelAvatarCover()` effect were deleted.
- `2026-08-25` — **One centered header row:** host titles, caller actions, and
  the three built-in panel controls share a 24px centered track; icon buttons
  use identical 32×24 boxes, fixing optical drift in every dynamic panel.
- `2026-07-16` — **Avatar cover:** automatic elevated shell user menu while a
  right/top/fullscreen/mobile dynamic panel would bury the header avatar.
  Mirrors the Canvas pane pattern; callers unchanged.
