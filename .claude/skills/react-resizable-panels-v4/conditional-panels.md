# react-resizable-panels v4 — conditional (mount/unmount) panels

## Contents

- §5 — Conditional panels (mount/unmount, not just collapse)
- Mount/unmount panels (different beast — and a hydration trap)

## §5 — Conditional panels (mount/unmount, not just collapse)

If a panel can be **fully removed from the DOM** (not collapsed to zero), each combination of mounted panels gets its own remembered layout via `useDefaultLayout({ id, panelIds })`.

```tsx
"use client";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

export function Workbench({ showLeft, showRight }: Props) {
  const panelIds = [
    ...(showLeft ? ["left"] : []),
    "center",
    ...(showRight ? ["right"] : []),
  ];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "workbench",
    panelIds,
    storage: cookieStorage, // see below
  });

  return (
    <Group id="workbench" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      {showLeft && <><Panel id="left" minSize="160px"><Left /></Panel><Separator /></>}
      <Panel id="center"><Editor /></Panel>
      {showRight && <><Separator /><Panel id="right" minSize="240px"><Right /></Panel></>}
    </Group>
  );
}
```

Storage key format (from library source): `react-resizable-panels:${groupId}:${...sortedPanelIds}`. Each `panelIds` permutation gets its own key, so toggling the right panel off and on again restores the same layout you had last time it was visible.

Cookie storage adapter (works with `useDefaultLayout`):

```ts
import type { LayoutStorage } from "react-resizable-panels";

export const cookieStorage: LayoutStorage = {
  getItem(key) {
    if (typeof document === "undefined") return null;
    const row = document.cookie.split("; ").find((r) => r.startsWith(`${encodeURIComponent(key)}=`));
    return row ? decodeURIComponent(row.split("=")[1]) : null;
  },
  setItem(key, value) {
    if (typeof document === "undefined") return;
    document.cookie =
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}` +
      `; path=/; max-age=31536000; SameSite=Lax`;
  },
};
```

Note: `useDefaultLayout` only runs on the client (it's in a `'use client'` component). For SSR-correct first paint with conditional panels, ALSO read the toggle state from a cookie on the server so the initial render mounts the correct set of panels:

```tsx
// Server page — page.tsx
const toggles = await readJsonCookie<Toggles>("panels:demo-05:toggles");
return (
  <ConditionalWorkbench initialShowRight={toggles?.showRight ?? true} />
);

// Client component
const [showRight, setShowRight] = useState(initialShowRight);
useEffect(() => {
  // persist toggle state so SSR can pick the right initial set next time
  document.cookie = `panels:demo-05:toggles=${encodeURIComponent(JSON.stringify({ showRight }))}; path=/; max-age=31536000; SameSite=Lax`;
}, [showRight]);
const panelIds = ["left", "center", ...(showRight ? ["right"] : [])];
const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id, panelIds, storage: cookieStorage });
```

Working example: [`05-conditional-panels/`](../../../app/(dev)/demos/resizables/05-conditional-panels/).

---

### Mount/unmount panels (different beast — and a hydration trap)

If you genuinely want to remove a panel from the DOM (not just collapse it), follow [`05-conditional-panels/`](../../../app/(dev)/demos/resizables/05-conditional-panels/). The pattern has two cookies and a hand-rolled persistence step — `useDefaultLayout` is NOT safe here:

**Why not `useDefaultLayout`:** the hook's `defaultLayout` return value is `undefined` on the server (no `document`) but populated on the first client paint. That mismatch produces React's "tree hydrated but some attributes... didn't match" error — the server sends `flex-grow: 1` (auto-distributed) and the client computes `flex-grow: 20` (from the cookie).

**The SSR-safe shape:**

1. **Toggle cookie** holds the mount state (e.g. `{ showRight: true }`). Server reads it to decide which panels to mount.
2. **Layout cookie keyed per combination** — the lib's storage key format is `react-resizable-panels:${groupId}:${...panelIds}`. Server reads the cookie for the current `panelIds` permutation and passes it as `defaultLayout` directly to `<Group>`.
3. The client component takes `initialLayout` as a prop and gives it straight to `<Group>` as `defaultLayout`. Same value SSR + first client render → no mismatch.
4. When the user toggles, `panelIds` changes. A `useEffect` reads the new combo's cookie and calls `groupRef.setLayout(newLayout)` to swap.
5. `onLayoutChanged` writes back to whichever combo's cookie is currently active.

```tsx
// page.tsx (server)
const GROUP_ID = "demo-05";
const TOGGLE_COOKIE = "panels:demo-05:toggles";

function buildLayoutCookieKey(panelIds: string[]) {
  return `react-resizable-panels:${[GROUP_ID, ...panelIds].join(":")}`;
}

async function readState() {
  const store = await cookies();
  const showRight = JSON.parse(store.get(TOGGLE_COOKIE)?.value ?? "{}")?.showRight ?? true;
  const panelIds = ["left", "center", ...(showRight ? ["right"] : [])];
  const layoutRaw = store.get(buildLayoutCookieKey(panelIds))?.value;
  const initialLayout = layoutRaw ? JSON.parse(decodeURIComponent(layoutRaw)) : undefined;
  return { showRight, initialLayout };
}

// ConditionalGroup.tsx (client) — see the demo file for full impl.
// Key shape:
<Group
  id={GROUP_ID}
  groupRef={groupRef}
  defaultLayout={initialLayout}     // ← from server prop, identical SSR + client
  onLayoutChanged={writeToCurrentComboKey}
>
  ...
</Group>
```

This shape is the only conditional-panel persistence pattern that's hydration-clean. **If you're tempted to use `useDefaultLayout` here, don't** — the convenience isn't worth the SSR mismatch.
