"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  GroupImperativeHandle,
  Layout,
  PanelProps,
} from "react-resizable-panels";

// Bridge for cross-portal panel control. Header lives in PageHeader (portaled
// into the shell header), panels live in the page body. Both subtrees read
// the same React Context (portals propagate context through the React tree).
//
// Why setLayout, not panel.collapse()/expand():
// The library's collapse()/expand() use a 2-panel pivot (adjacent index) for
// redistributing space. Collapsing the LAST panel pivots [n-1, n] — its freed
// space goes to the immediate left neighbor. Two adjacent collapsibles will
// re-expand each other (collapsing B pushes B's space into already-collapsed A,
// which re-opens A). For independent toggles we have to set the WHOLE layout
// at once via groupRef.setLayout(), bypassing the pivot.
//
// The rules this file keeps (features/resizable-panels/FEATURE.md):
//  1. toggle() hands setLayout a layout that already sums to what the group
//     sums to — the toggled panel at exactly its target, the difference taken
//     from / given to the non-toggleable filler first. Never let the library
//     normalize: normalizing moves every column and shortens the reopened one.
//  2. The collapsed flag comes from the layout setLayout() APPLIED, never from
//     what toggle() intended.
//  3. The open size to restore is only ever a SETTLED value (onLayoutChanged,
//     or the layout at the moment of a toggle-collapse) — never a live drag
//     value, which passes through slivers on its way to the collapse snap.
//  4. Size props are converted with the library's unit rules at toggle time
//     (a bare number is px). Every fallback warns, naming the panel.

type PanelSizeProp = PanelProps["defaultSize"];

const LOG = "[resizable-panels]";

interface PanelEntry {
  elementRef: RefObject<HTMLDivElement | null>;
  groupKey: string;
  defaultSize: PanelSizeProp;
  minSize: PanelSizeProp;
  /** Most recent SETTLED open size (%). undefined = not seen open this session. */
  lastOpenSize: number | undefined;
}

export interface RegisteredPanelSizing {
  defaultSize: PanelSizeProp;
  minSize: PanelSizeProp;
}

interface ContextValue {
  registerGroup(
    groupKey: string,
    groupRef: RefObject<GroupImperativeHandle | null>,
  ): void;
  registerPanel(
    panelId: string,
    groupKey: string,
    elementRef: RefObject<HTMLDivElement | null>,
    sizing: RegisteredPanelSizing,
  ): void;
  /** Called from ClientGroup.onLayoutChanged (settled: pointer-up, keyboard,
   *  imperative, mount) — the only source of remembered open sizes. */
  notifyLayoutChanged(groupKey: string, layout: Layout): void;
  /** Called from RegisteredPanel.onResize — mirrors only the collapsed
   *  BOOLEAN so toggle icons + hidden handles follow a drag-collapse. */
  notifyResize(panelId: string, sizePercent: number): void;
  toggle(panelId: string): void;
  isCollapsed(panelId: string): boolean;
}

const Ctx = createContext<ContextValue | null>(null);

/** The library's group size: the sum of its panels' main-axis pixels. */
function measureGroupPx(panelElement: HTMLElement | null): number {
  const group = panelElement?.parentElement;
  if (!group) return 0;
  const vertical = group.style.flexDirection === "column";
  let px = 0;
  for (const child of Array.from(group.children)) {
    if (child instanceof HTMLElement && child.hasAttribute("data-panel")) {
      px += vertical ? child.offsetHeight : child.offsetWidth;
    }
  }
  return px;
}

/** A Panel size prop as % of its group, by the library's unit rules: a number
 *  is px; a string is %, px, rem, em, vh or vw by suffix, and % without one. */
function sizePropToPercent(
  value: PanelSizeProp,
  groupPx: number,
  panelElement: HTMLElement | null,
): number | undefined {
  if (value === undefined) return undefined;
  const amount = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(amount)) return undefined;
  const unit =
    typeof value === "number"
      ? "px"
      : value.endsWith("%")
        ? "%"
        : value.endsWith("px")
          ? "px"
          : value.endsWith("rem")
            ? "rem"
            : value.endsWith("em")
              ? "em"
              : value.endsWith("vh")
                ? "vh"
                : value.endsWith("vw")
                  ? "vw"
                  : "%";
  if (unit === "%") return amount;
  if (groupPx <= 0) return undefined;
  const fontPx = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
  const px =
    unit === "px"
      ? amount
      : unit === "rem"
        ? amount * fontPx(document.documentElement)
        : unit === "em"
          ? amount * fontPx(panelElement ?? document.documentElement)
          : unit === "vh"
            ? (amount / 100) * window.innerHeight
            : (amount / 100) * window.innerWidth;
  return parseFloat(((px / groupPx) * 100).toFixed(3));
}

type DonorOrder = "filler-first" | "toggleable-first";

/** `layout` with `panelId` at exactly `size`, still summing to the same total.
 *  The difference comes from (or goes to) one tier of OPEN panels at a time —
 *  the non-toggleable filler or the other toggleable panels, in `order` —
 *  proportionally to their size. Collapsed panels are never touched. */
function layoutWithPanelAt(
  layout: Layout,
  panelId: string,
  size: number,
  toggleable: ReadonlySet<string>,
  order: DonorOrder,
): Layout {
  const next: Layout = { ...layout, [panelId]: size };
  let delta = size - (layout[panelId] ?? 0);
  const open = Object.keys(layout).filter(
    (id) => id !== panelId && (layout[id] ?? 0) > 0,
  );
  const filler = open.filter((id) => !toggleable.has(id));
  const others = open.filter((id) => toggleable.has(id));
  const tiers = order === "filler-first" ? [filler, others] : [others, filler];
  for (const tier of tiers) {
    if (delta === 0) break;
    const total = tier.reduce((sum, id) => sum + (layout[id] ?? 0), 0);
    if (total <= 0) continue;
    const moved = delta > 0 ? Math.min(delta, total) : delta;
    for (const id of tier) {
      const current = layout[id] ?? 0;
      next[id] = current - moved * (current / total);
    }
    delta -= moved;
  }
  return next;
}

/** The % to reopen a collapsed panel at. Warns for every fallback. */
function resolveRestoreSize(
  panelId: string,
  entry: PanelEntry,
): number | undefined {
  const element = entry.elementRef.current;
  const groupPx = measureGroupPx(element);
  const min = sizePropToPercent(entry.minSize, groupPx, element) ?? 0;
  let size = entry.lastOpenSize;

  if (size === undefined) {
    const fromDefault = sizePropToPercent(entry.defaultSize, groupPx, element);
    if (fromDefault !== undefined && fromDefault > 0) {
      console.warn(
        `${LOG} "${panelId}" has not been open this session (it mounted collapsed), so it reopens at its defaultSize ${JSON.stringify(entry.defaultSize)} = ${fromDefault}%; its width from before the page loaded is not remembered.`,
      );
      size = fromDefault;
    } else if (min > 0) {
      console.warn(
        `${LOG} "${panelId}" has no remembered open width and no usable defaultSize, so it reopens at its minSize ${JSON.stringify(entry.minSize)} = ${min}%. Give the <RegisteredPanel> a defaultSize.`,
      );
      size = min;
    } else {
      console.warn(
        `${LOG} "${panelId}" cannot reopen: no remembered open width, and neither defaultSize nor minSize resolves to a size. Give the <RegisteredPanel> a defaultSize.`,
      );
      return undefined;
    }
  }

  if (size < min) {
    console.warn(
      `${LOG} "${panelId}" remembered ${size}%, below its minSize ${JSON.stringify(entry.minSize)} = ${min}% at the current group size (the library would snap it shut), so it reopens at minSize.`,
    );
    size = min;
  }
  return size;
}

function collapsedFromLayouts(
  layouts: ReadonlyArray<Layout | undefined> | undefined,
): Record<string, boolean> {
  const collapsed: Record<string, boolean> = {};
  for (const layout of layouts ?? []) {
    if (!layout) continue;
    for (const [panelId, size] of Object.entries(layout)) {
      if (size === 0) collapsed[panelId] = true;
    }
  }
  return collapsed;
}

export function PanelControlProvider({
  children,
  initialLayouts,
}: {
  children: React.ReactNode;
  /** The layout cookie(s) the server already read for this page's groups
   *  (`readLayoutCookie`) — seeds which panels are collapsed so the server
   *  paint already shows the right toggle icons and hides handles beside
   *  collapsed panels, instead of correcting after hydration. Keys are Panel
   *  ids, which must equal each RegisteredPanel's registerAs. */
  initialLayouts?: ReadonlyArray<Layout | undefined>;
}) {
  const groupsRef = useRef<
    Record<string, RefObject<GroupImperativeHandle | null>>
  >({});
  const panelsRef = useRef<Record<string, PanelEntry>>({});
  const settledLayoutsRef = useRef<Record<string, Layout>>({});
  const [intent, setIntent] = useState<Record<string, boolean>>(() =>
    collapsedFromLayouts(initialLayouts),
  );

  const registerGroup = useCallback(
    (groupKey: string, groupRef: RefObject<GroupImperativeHandle | null>) => {
      groupsRef.current[groupKey] = groupRef;
    },
    [],
  );

  const registerPanel = useCallback(
    (
      panelId: string,
      groupKey: string,
      elementRef: RefObject<HTMLDivElement | null>,
      sizing: RegisteredPanelSizing,
    ) => {
      const existing = panelsRef.current[panelId];
      // The group reports its mount layout (a layout effect) before panels
      // register (a passive effect) — pick that settled size up here.
      const settled = settledLayoutsRef.current[groupKey]?.[panelId];
      panelsRef.current[panelId] = {
        elementRef,
        groupKey,
        defaultSize: sizing.defaultSize,
        minSize: sizing.minSize,
        lastOpenSize:
          existing?.lastOpenSize ??
          (settled !== undefined && settled > 0 ? settled : undefined),
      };
    },
    [],
  );

  const notifyLayoutChanged = useCallback(
    (groupKey: string, layout: Layout) => {
      settledLayoutsRef.current[groupKey] = layout;
      for (const [panelId, entry] of Object.entries(panelsRef.current)) {
        if (entry.groupKey !== groupKey) continue;
        const size = layout[panelId];
        if (size !== undefined && size > 0) entry.lastOpenSize = size;
      }
    },
    [],
  );

  const notifyResize = useCallback((panelId: string, sizePercent: number) => {
    if (!panelsRef.current[panelId]) return;
    // Deliberately DO NOT capture lastOpenSize here: onResize fires on every
    // frame of a live drag, and a drag-to-collapse passes through every size
    // down to ~minSize before it snaps to 0 — capturing those would reopen the
    // panel as a sliver. Open sizes come only from notifyLayoutChanged.
    setIntent((prev) => {
      const isAtZero = sizePercent === 0;
      return prev[panelId] === isAtZero
        ? prev
        : { ...prev, [panelId]: isAtZero };
    });
  }, []);

  const toggle = useCallback((panelId: string) => {
    const entry = panelsRef.current[panelId];
    if (!entry) {
      console.warn(
        `${LOG} toggle("${panelId}") did nothing: no <RegisteredPanel registerAs="${panelId}"> is mounted under this <PanelControlProvider>.`,
      );
      return;
    }
    const group = groupsRef.current[entry.groupKey]?.current;
    if (!group) {
      console.warn(
        `${LOG} toggle("${panelId}") did nothing: no <ClientGroup groupKey="${entry.groupKey}"> is mounted under this <PanelControlProvider>.`,
      );
      return;
    }

    const currentLayout = group.getLayout();
    const currentSize = currentLayout[panelId];
    if (currentSize === undefined) {
      console.warn(
        `${LOG} toggle("${panelId}") did nothing: group "${entry.groupKey}" has no laid-out panel with that id (the group is hidden or zero-size, or the Panel id differs from registerAs).`,
      );
      return;
    }

    const willCollapse = currentSize > 0;
    let target = 0;
    if (willCollapse) {
      entry.lastOpenSize = currentSize;
    } else {
      const restore = resolveRestoreSize(panelId, entry);
      if (restore === undefined) return;
      target = restore;
    }

    const toggleable = new Set(
      Object.keys(panelsRef.current).filter(
        (id) => panelsRef.current[id]?.groupKey === entry.groupKey,
      ),
    );
    // Space comes from the filler first. The provider cannot see the filler's
    // minSize, so if the library clamps the filler back up (the reopened panel
    // comes back short), take the rest from the other open toggleable panels,
    // starting from the layout the library just accepted.
    let applied = currentLayout;
    for (const order of ["filler-first", "toggleable-first"] as const) {
      applied = group.setLayout(
        layoutWithPanelAt(applied, panelId, target, toggleable, order),
      );
      if (Math.abs((applied[panelId] ?? 0) - target) <= 0.1) break;
    }
    const appliedSize = applied[panelId] ?? 0;
    if (Math.abs(appliedSize - target) > 0.1) {
      console.warn(
        `${LOG} "${panelId}" was asked to ${willCollapse ? "collapse" : `reopen at ${target}%`} but the library applied ${appliedSize}% (the other panels' size constraints left no room).`,
      );
    }

    const collapsed = appliedSize === 0;
    setIntent((prev) =>
      prev[panelId] === collapsed ? prev : { ...prev, [panelId]: collapsed },
    );
  }, []);

  const isCollapsed = useCallback(
    (panelId: string) => !!intent[panelId],
    [intent],
  );

  return (
    <Ctx.Provider
      value={{
        registerGroup,
        registerPanel,
        notifyLayoutChanged,
        notifyResize,
        toggle,
        isCollapsed,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePanelControls() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "usePanelControls() must be used inside <PanelControlProvider>",
    );
  }
  return ctx;
}

/** Safe variant — returns null if no provider above. Used by ClientGroup so
 *  demos that don't need a provider (00, 01) still work without it. */
export function usePanelControlsOptional() {
  return useContext(Ctx);
}
