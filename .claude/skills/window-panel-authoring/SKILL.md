---
name: window-panel-authoring
description: Create, modify, or audit floating window panels in the matrx-admin window-panels system. Covers the full 5-step registration flow (registry → component → OverlayController → SidebarWindowToggle → optional URL hydrator), the Supabase window_sessions persistence contract, onCollectData patterns, ephemeral vs persisted windows, sidebar/footer layout rules, and the multi-window pattern. Use when creating a new window panel, editing an existing window component, adding persistence to a window, wiring a window into the Tools grid, or debugging why a window fails to restore after page reload.
---

# Window Panel Authoring

## Quick Orientation

All floating windows share one shell (`WindowPanel`), one persistence system (`window_sessions` Supabase table via `WindowPersistenceManager`), and one central registry (`windowRegistry.ts`). The registry is the single source of truth — every window must be registered there.

**Key files:**

| File | When you touch it |
|------|-------------------|
| `features/window-panels/registry/windowRegistry.ts` | Every new window or `data` shape change |
| `features/window-panels/windows/MyWindow.tsx` | New window component |
| `components/overlays/OverlayController.tsx` | Mount the window via `dynamic()` |
| `features/window-panels/SidebarWindowToggle.tsx` | Add to the Tools grid |
| `features/window-panels/url-sync/initUrlHydration.ts` | Optional `?panels=` deep-link |

---

## Step-by-Step: Creating a New Window

### 1. Register in `windowRegistry.ts`

```ts
// features/window-panels/registry/windowRegistry.ts — add to REGISTRY array
{
  slug: "my-feature-window",       // kebab-case; stored in window_sessions.window_type
  overlayId: "myFeatureWindow",    // camelCase; must match overlaySlice key exactly
  label: "My Feature",
  defaultData: {
    selectedId: null,
    search: "",
  },
  // ephemeral: true,  // uncomment for debug/tool windows that should NOT persist
},
```

Rules:
- `slug` is globally unique, kebab-case, stored as a DB column value.
- `overlayId` is the key dispatched in `openOverlay({ overlayId })` everywhere.
- `defaultData` documents every key `onCollectData()` will ever return.

### 2. Create `windows/MyFeatureWindow.tsx`

```tsx
"use client";
import React, { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MyFeatureBody } from "@/features/my-feature/components/MyFeatureBody";

interface MyFeatureWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedId?: string | null;   // from overlayData passed by OverlayController
}

export default function MyFeatureWindow({ isOpen, onClose, initialSelectedId }: MyFeatureWindowProps) {
  if (!isOpen) return null;
  return <MyFeatureWindowInner onClose={onClose} initialSelectedId={initialSelectedId} />;
}

function MyFeatureWindowInner({ onClose, initialSelectedId }: Omit<MyFeatureWindowProps, "isOpen">) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);

  const collectData = useCallback(
    (): Record<string, unknown> => ({ selectedId }),
    [selectedId],
  );

  return (
    <WindowPanel
      title="My Feature"
      id="my-feature-window"          // stable id — key in windowManagerSlice
      minWidth={380}
      minHeight={280}
      width={560}
      height={440}
      position="center"
      onClose={onClose}
      overlayId="myFeatureWindow"     // must match registry
      onCollectData={collectData}
    >
      <MyFeatureBody selectedId={selectedId} onSelect={setSelectedId} />
    </WindowPanel>
  );
}
```

Critical rules:
- Outer guard `if (!isOpen) return null` — inner component does the real work.
- `id` must be stable (not random UUID) — it is the Redux key for geometry.
- `overlayId` must exactly match the registry `overlayId`.
- `onCollectData` must return **all** keys that appear in `defaultData`. Wrap in `useCallback` with all dependencies.

### 3. Register in `OverlayController.tsx`

```ts
// Add dynamic import near other window imports
const MyFeatureWindow = dynamic(
  () => import("@/features/window-panels/windows/MyFeatureWindow"),
  { ssr: false },
);
```

```ts
// Add selectors near other window selectors
const isMyFeatureWindowOpen = useAppSelector((s) => selectIsOverlayOpen(s, "myFeatureWindow"));
const myFeatureWindowData = useAppSelector((s) => selectOverlayData(s, "myFeatureWindow"));
```

```tsx
{/* Add inside the overlay render section */}
{isMyFeatureWindowOpen && (
  <MyFeatureWindow
    isOpen={isMyFeatureWindowOpen}
    onClose={() => dispatch(closeOverlay("myFeatureWindow"))}
    initialSelectedId={myFeatureWindowData?.selectedId ?? null}
  />
)}
```

### 4. Add to `SidebarWindowToggle.tsx`

```ts
{
  label: "My Feature",
  icon: MyFeatureIcon,   // Lucide icon
  action: () => dispatch(openOverlay({ overlayId: "myFeatureWindow" })),
},
```

### 5. (Optional) URL hydrator — `initUrlHydration.ts`

Only needed if you want `?panels=my_feature` to reopen the window:

```ts
registerPanelHydrator("my_feature", (params) => {
  dispatch(openOverlay({
    overlayId: "myFeatureWindow",
    data: { selectedId: params.selectedId ?? null },
  }));
});
```

---

## Modifying an Existing Window

When you add/remove keys from a window's content state:

1. Update `defaultData` in `windowRegistry.ts` — add new keys with null/empty defaults; remove stale ones.
2. Update `onCollectData` in the window component to return all current keys.
3. Update the inner component to read new keys from `initialXxx` props.
4. Update `OverlayController.tsx` if `overlayData` destructuring changes.

---

## Persistence Contract

`WindowPanel` handles geometry persistence automatically when `overlayId` is set. The child only supplies content via `onCollectData`.

**What `panelState` captures (automatic):**
- `rect`: `{ x, y, width, height }`
- `windowState`: `"windowed" | "maximized" | "minimized"`
- `sidebarOpen`: boolean
- `zIndex`: number

**What `data` captures (child's responsibility):**
- Whatever `onCollectData()` returns — must be JSON-serializable, must match `defaultData` shape.

**Save triggers:**
- Explicit: user clicks "Save window state" in the green traffic-light dropdown.
- Piggyback: child triggers its own save and includes `onCollectData` in the same write.

**Not saved on:** move, resize, sidebar toggle, tab switch.

**On close:** the DB row is deleted so the window doesn't reopen next load.

**On page load:** `WindowPersistenceManager` fetches all rows and re-dispatches `openOverlay` + `restoreWindowState`.

---

## Ephemeral Windows

Use `ephemeral: true` in the registry for windows that must NOT persist:
- Debug/dev tool windows
- One-shot dialogs (file upload, confirmation flows)
- Windows whose state cannot be serialized (file blobs, live streams)

Ephemeral windows: no DB row, no "Save window state" button, no restore on reload.

---

## Sidebar Layout Rules

```tsx
// Correct sidebar root
<div className="flex flex-col min-h-0 h-full">
  <div className="px-2 py-1 border-b text-xs font-medium shrink-0">Header</div>
  <div className="flex-1 min-h-0 p-1.5 space-y-1">
    {items.map(item => <Item key={item.id} />)}
  </div>
</div>
```

- DO use `h-full min-h-0 flex flex-col` on root.
- DO NOT set `overflow-y-auto` on root — `WindowPanel` handles it.
- DO NOT use `shrink-0` on the root element.

---

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `overlayId` in component ≠ registry `overlayId` | Window never saves, no "Save" button appears | Make them identical |
| `onCollectData` returns stale closure | Saved data has old values | Add all state deps to `useCallback` |
| Missing from `OverlayController.tsx` | Window never renders | Add `dynamic()` import + render block |
| Missing from `windowRegistry.ts` | No persistence, "Save" button hidden | Add registry entry |
| Random `id` passed to `WindowPanel` | Geometry lost on re-render | Use stable string like `"my-feature-window"` |
| `ephemeral: true` but window needs restore | Window doesn't reopen | Remove `ephemeral` flag |

---

## Additional Resources

- Full prop reference and all registered windows: `features/window-panels/README.md`
- Registry source of truth: `features/window-panels/registry/windowRegistry.ts`
- Persistence service: `features/window-panels/service/windowPersistenceService.ts`
- Context provider: `features/window-panels/WindowPersistenceManager.tsx`
