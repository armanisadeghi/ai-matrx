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
  PanelImperativeHandle,
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

interface PanelEntry {
  panelRef: RefObject<PanelImperativeHandle | null>;
  groupKey: string;
  defaultSizePercent: number;
  // Most recent OPEN size — restored on expand.
  lastOpenSize: number;
}

interface ContextValue {
  registerGroup(
    groupKey: string,
    groupRef: RefObject<GroupImperativeHandle | null>,
  ): void;
  registerPanel(
    panelId: string,
    groupKey: string,
    panelRef: RefObject<PanelImperativeHandle | null>,
    defaultSizePercent: number,
  ): void;
  /** Called from RegisteredPanel.onResize — keeps lastOpenSize fresh and
   *  syncs the boolean intent so toggle icons reflect drag-to-collapse. */
  notifyResize(panelId: string, sizePercent: number): void;
  toggle(panelId: string): void;
  isCollapsed(panelId: string): boolean;
}

const Ctx = createContext<ContextValue | null>(null);

export function PanelControlProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const groupsRef = useRef<
    Record<string, RefObject<GroupImperativeHandle | null>>
  >({});
  const panelsRef = useRef<Record<string, PanelEntry>>({});
  const [intent, setIntent] = useState<Record<string, boolean>>({});

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
      panelRef: RefObject<PanelImperativeHandle | null>,
      defaultSizePercent: number,
    ) => {
      const existing = panelsRef.current[panelId];
      panelsRef.current[panelId] = {
        panelRef,
        groupKey,
        defaultSizePercent,
        lastOpenSize: existing?.lastOpenSize ?? defaultSizePercent,
      };
    },
    [],
  );

  const notifyResize = useCallback((panelId: string, sizePercent: number) => {
    const entry = panelsRef.current[panelId];
    if (!entry) return;
    if (sizePercent > 0) {
      entry.lastOpenSize = sizePercent;
    }
    setIntent((prev) => {
      const isAtZero = sizePercent === 0;
      return prev[panelId] === isAtZero
        ? prev
        : { ...prev, [panelId]: isAtZero };
    });
  }, []);

  const toggle = useCallback((panelId: string) => {
    const entry = panelsRef.current[panelId];
    if (!entry) return;
    const groupRef = groupsRef.current[entry.groupKey]?.current;
    if (!groupRef) return;

    const currentLayout = groupRef.getLayout();
    const willCollapse = (currentLayout[panelId] ?? 0) > 0;

    // Capture current size so the next expand restores exactly what the user
    // had (covers the case where they dragged to a new size and then toggled).
    if (willCollapse && currentLayout[panelId] !== undefined) {
      entry.lastOpenSize = currentLayout[panelId];
    }

    // Build a new layout that explicitly sets EVERY panel's size:
    //   - the toggled one to 0 (collapse) or its lastOpenSize (expand)
    //   - all OTHER panels keep their current size
    // The library's setLayout normalizes the sum to 100; the delta is
    // absorbed by panels with room (typically the non-collapsible filler).
    const newLayout: Record<string, number> = { ...currentLayout };
    newLayout[panelId] = willCollapse ? 0 : entry.lastOpenSize;

    groupRef.setLayout(newLayout);

    setIntent((prev) => ({ ...prev, [panelId]: willCollapse }));
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
