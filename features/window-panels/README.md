# Window Panels

A Redux-backed, local-first OS-style window manager. Handles classic floating windows, bottom sheets, modals, and inline agent widgets through one registry and one renderer.

> **Primary docs**: [`FEATURE.md`](./FEATURE.md) — architecture, invariants, registry fields, slice responsibilities, mobile model, bundle rules, persistence details, known gaps, change log.
> This README is the lightweight entry point; `FEATURE.md` is the full reference.

---

## The two-step recipe

**1. Register it** in [`registry/windowRegistryMetadata.ts`](./registry/windowRegistryMetadata.ts) and add its lazy render mapping in [`../overlays/OverlayController.tsx`](../overlays/OverlayController.tsx):

```ts
{
  slug: "my-feature-window",
  overlayId: "myFeatureWindow",
  kind: "window",
  label: "My Feature",
  defaultData: { selectedId: null, search: "" },
  mobilePresentation: "drawer",
},
```

Then add the lazy import and exact typed render block in `OverlayController.tsx`; never import component code into the static metadata registry.

**2. Write the component** — mounts `<WindowPanel>`, implements `onCollectData`:

```tsx
"use client";
import { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export default function MyFeatureWindow({
  isOpen,
  onClose,
  selectedId,
  search,
}) {
  if (!isOpen) return null;
  const [sel, setSel] = useState<string | null>(selectedId ?? null);
  const collect = useCallback(() => ({ selectedId: sel, search: "" }), [sel]);
  return (
    <WindowPanel
      id="my-feature-window"
      title="My Feature"
      overlayId="myFeatureWindow"
      onClose={onClose}
      onCollectData={collect}
    >
      <div>…</div>
    </WindowPanel>
  );
}
```

**That's all.** The controller and static registry drive rendering and mobile routing. URL sync needs a hydrator, Tools-grid placement needs `toolsGridTiles.ts`, and refresh preservation is enabled only by an audited `preservation` allowlist.

Do **not** seed `overlaySlice.ts`'s `initialState` or add windows to a shell import list. Overlay rendering is explicit in `features/overlays/OverlayController.tsx`; static metadata stays component-free.

---

## Registry fields (summary)

| Field                        | Required          | Purpose                                                                                                         |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `slug`                       | ✅                | Stable kebab-case URL/diagnostic identifier. Must be unique.                                                    |
| `overlayId`                  | ✅                | camelCase; key in `overlaySlice`. Must be unique.                                                               |
| `kind`                       | ✅                | `"window"` / `"widget"` / `"sheet"` / `"modal"`.                                                                |
| Lazy renderer                | ✅                | `lazyOverlay(() => import(...), { ssr: false })` in `OverlayController.tsx`.                                    |
| `label`                      | ✅                | Human-readable. Shown in tray + window manager.                                                                 |
| `defaultData`                | ✅                | Fallback payload shape. Docs the data keys the component expects.                                               |
| `mobilePresentation`         | ✅ for `"window"` | `"fullscreen"` / `"drawer"` / `"card"` / `"hidden"`.                                                            |
| `mobileSidebarAs`            |                   | `"drawer"` (default) or `"inline"`. Only for windows with a sidebar.                                            |
| `instanceMode`               |                   | `"singleton"` (default) or `"multi"`.                                                                           |
| `urlSync`                    |                   | Dormant `{ key: string }` metadata for `?panels=`. It has no runtime effect until `UrlPanelManager` is mounted. |
| `ephemeral`                  |                   | Skip local refresh preservation.                                                                                |
| `preservation`               |                   | Default-deny semantic-data allowlist for local refresh restore.                                                 |
| `heavySnapshot` / `autosave` |                   | Phase 7 opt-ins — not wired yet.                                                                                |

See [`FEATURE.md`](./FEATURE.md) for the full schema with doc comments.

---

## Mobile presentation — decision tree

1. **Has a sidebar?** → `"drawer"` (sidebar collapses into a nested right-side drawer).
2. **Content-dominant experience** (chat, feed, editor)? → `"fullscreen"`.
3. **Small utility / debug surface?** → `"card"` (floating bottom-right, non-modal).
4. **Never renders on mobile?** → `"hidden"` (dev warning if opened).

---

## URL deep-linking

`UrlPanelManager` is currently **not mounted**, so registry `urlSync` metadata and hydrators are dormant. Do not rely on URL restoration in a window workflow today. If URL sync is re-enabled, mount the manager first, then use the contract below and test every context-dependent hydrator.

Set `urlSync: { key: "my_feature" }` on the registry entry. Register a hydrator in [`url-sync/initUrlHydration.ts`](./url-sync/initUrlHydration.ts):

```ts
registerPanelHydrator("my_feature", (dispatch, id, args) => {
  dispatch(
    openOverlay({
      overlayId: "myFeatureWindow",
      data: { selectedId: args.id ?? null },
    }),
  );
});
```

A dev-time assertion in that file logs an error if any registry `urlSync.key` lacks a hydrator once the manager is mounted.

---

## Bundle rules

Non-negotiable:

- **Never** statically import a window component into registry metadata, a route, layout, provider, or boot module. Add its lazy renderer to `features/overlays/OverlayController.tsx`.
- **Never** import `SidebarWindowToggle` statically anywhere other than its single mount in `features/shell/components/sidebar/Sidebar.tsx` (which uses `dynamic()`).
- `scripts/check-bundle-size.ts` gates per-route bundle growth at +2 KB per PR. Capture a baseline with `pnpm check:bundle:capture`; verify with `pnpm check:bundle`.

---

## Persistence (summary)

- Redux changes are coalesced into a bounded tab/identity-scoped workspace; close and pagehide synchronously update its localStorage mirror.
- Geometry and allowlisted semantic `data` are mirrored to localStorage and queued to IndexedDB. No screenshot or callback data is persisted.
- Rect restores clamp to viewport via `utils/rectClamp.ts` — stored rects never land off-screen.
- Preservation is deliberately enabled for 5 of 106 registered windows; the remaining windows require a state-contract audit before opt-in.
- Idle GC every 30 min prunes closed multi-instance entries.

See `FEATURE.md` for the full lifecycle, safety limits, and rollout criteria.

---

## Common pitfalls

1. **`kind: "window"` without `mobilePresentation`** — dev assertion fails.
2. **Assuming `urlSync` is live** — `UrlPanelManager` is currently unmounted; `?panels=` does not hydrate windows.
3. **Prop names not matching `defaultData` keys** — `OverlayController` passes typed data explicitly; keep the metadata shape and renderer props aligned.
4. **Opening a multi-instance overlay without a fresh `instanceId`** — instances overwrite each other. Use `instanceId: \`${slug}-${Date.now()}\``or let the Tools grid's`instanceStrategy: "fresh-per-click"` handle it.
5. **Editing `overlaySlice.ts` `initialState`** — don't. It's `{}` by design; overlay keys grow lazily.

---

## Key files to know

- [`registry/windowRegistryMetadata.ts`](./registry/windowRegistryMetadata.ts) — component-free window metadata and preservation policy.
- [`../overlays/OverlayController.tsx`](../overlays/OverlayController.tsx) — typed lazy renderer for open overlays.
- [`WindowPanel.tsx`](./WindowPanel.tsx) — desktop shell; mobile branch routes through `mobile/`.
- [`tools-grid/toolsGridTiles.ts`](./tools-grid/toolsGridTiles.ts) — declarative Tools-grid config.
- [`FEATURE.md`](./FEATURE.md) — deep reference.
