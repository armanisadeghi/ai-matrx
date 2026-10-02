/**
 * THE canvas reducer. Plain Redux-compatible reducer + action creators with no
 * Redux Toolkit dependency, so it mounts in a host's RTK store
 * (`canvasHost: canvasReducer`) or runs inside the package's own standalone
 * store with identical behaviour.
 *
 * Identity law: an item is `kind::key`. Opening an item that is already on the
 * canvas never duplicates it — it refreshes its data/title, activates its tab
 * and focuses its pane, wherever that pane is.
 */

import { canvasItemId, paneIdFromSeq, splitIdFromSeq } from "./ids";
import { isValidLayout, listPaneIds, removePane, resizeSplit, splitPane } from "./layout";
import {
  CANVAS_DEFAULT_WIDTH,
  CANVAS_MIN_WIDTH,
  type CanvasItem,
  type CanvasItemId,
  type CanvasJson,
  type CanvasOpenInput,
  type CanvasOrientation,
  type CanvasPane,
  type CanvasPaneId,
  type CanvasSplitId,
  type CanvasState,
} from "./types";

const P = "matrxCanvas/";

export type CanvasAction =
  | { type: `${typeof P}open`; payload: CanvasOpenInput & { now: number } }
  | { type: `${typeof P}update`; payload: { itemId: CanvasItemId; data?: CanvasJson | undefined; title?: string | null | undefined; now: number } }
  | { type: `${typeof P}closeItem`; payload: { itemId: CanvasItemId } }
  | { type: `${typeof P}closeOthers`; payload: { itemId: CanvasItemId } }
  | { type: `${typeof P}activate`; payload: { itemId: CanvasItemId } }
  | { type: `${typeof P}focusPane`; payload: { paneId: CanvasPaneId } }
  | { type: `${typeof P}moveItem`; payload: { itemId: CanvasItemId; toPaneId: CanvasPaneId; index?: number | undefined } }
  | { type: `${typeof P}splitPane`; payload: { paneId: CanvasPaneId; orientation: CanvasOrientation; moveItemId?: CanvasItemId | undefined } }
  | { type: `${typeof P}closePane`; payload: { paneId: CanvasPaneId } }
  | { type: `${typeof P}resizeSplit`; payload: { splitId: CanvasSplitId; sizes: readonly number[] } }
  | { type: `${typeof P}setOpen`; payload: { open: boolean } }
  | { type: `${typeof P}toggle` }
  | { type: `${typeof P}setFullscreen`; payload: { fullscreen: boolean } }
  | { type: `${typeof P}setWidth`; payload: { width: number } }
  | { type: `${typeof P}hydrate`; payload: { snapshot: CanvasState | null } }
  | { type: `${typeof P}reset` };

export const canvasActions = {
  open: (input: CanvasOpenInput): CanvasAction => ({ type: `${P}open`, payload: { ...input, now: Date.now() } }),
  update: (itemId: CanvasItemId, patch: { data?: CanvasJson | undefined; title?: string | null | undefined }): CanvasAction => ({
    type: `${P}update`,
    payload: { itemId, ...patch, now: Date.now() },
  }),
  closeItem: (itemId: CanvasItemId): CanvasAction => ({ type: `${P}closeItem`, payload: { itemId } }),
  closeOthers: (itemId: CanvasItemId): CanvasAction => ({ type: `${P}closeOthers`, payload: { itemId } }),
  activate: (itemId: CanvasItemId): CanvasAction => ({ type: `${P}activate`, payload: { itemId } }),
  focusPane: (paneId: CanvasPaneId): CanvasAction => ({ type: `${P}focusPane`, payload: { paneId } }),
  moveItem: (itemId: CanvasItemId, toPaneId: CanvasPaneId, index?: number): CanvasAction => ({
    type: `${P}moveItem`,
    payload: { itemId, toPaneId, index },
  }),
  splitPane: (paneId: CanvasPaneId, orientation: CanvasOrientation, moveItemId?: CanvasItemId): CanvasAction => ({
    type: `${P}splitPane`,
    payload: { paneId, orientation, moveItemId },
  }),
  closePane: (paneId: CanvasPaneId): CanvasAction => ({ type: `${P}closePane`, payload: { paneId } }),
  resizeSplit: (splitId: CanvasSplitId, sizes: readonly number[]): CanvasAction => ({
    type: `${P}resizeSplit`,
    payload: { splitId, sizes },
  }),
  setOpen: (open: boolean): CanvasAction => ({ type: `${P}setOpen`, payload: { open } }),
  toggle: (): CanvasAction => ({ type: `${P}toggle` }),
  setFullscreen: (fullscreen: boolean): CanvasAction => ({ type: `${P}setFullscreen`, payload: { fullscreen } }),
  setWidth: (width: number): CanvasAction => ({ type: `${P}setWidth`, payload: { width } }),
  hydrate: (snapshot: CanvasState | null): CanvasAction => ({ type: `${P}hydrate`, payload: { snapshot } }),
  reset: (): CanvasAction => ({ type: `${P}reset` }),
} as const;

export function isCanvasAction(action: unknown): action is CanvasAction {
  return (
    !!action &&
    typeof action === "object" &&
    typeof (action as { type?: unknown }).type === "string" &&
    (action as { type: string }).type.startsWith(P)
  );
}

export function createInitialCanvasState(): CanvasState {
  const paneId = paneIdFromSeq(1);
  return {
    version: 1,
    isOpen: false,
    isFullscreen: false,
    width: CANVAS_DEFAULT_WIDTH,
    layout: { type: "pane", paneId },
    panes: { [paneId]: { id: paneId, itemIds: [], activeItemId: null } },
    items: {},
    focusedPaneId: paneId,
    seq: 1,
    hydrated: false,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function paneOf(state: CanvasState, itemId: CanvasItemId): CanvasPane | null {
  for (const pane of Object.values(state.panes)) {
    if (pane.itemIds.includes(itemId)) return pane;
  }
  return null;
}

function withPane(state: CanvasState, pane: CanvasPane): CanvasState {
  return { ...state, panes: { ...state.panes, [pane.id]: pane } };
}

/** After removing `itemId` from a tab list, the neighbour that takes focus. */
function nextActive(itemIds: readonly CanvasItemId[], removed: CanvasItemId, current: CanvasItemId | null): CanvasItemId | null {
  if (current !== removed) return current;
  const index = itemIds.indexOf(removed);
  const rest = itemIds.filter((id) => id !== removed);
  return rest[Math.min(index, rest.length - 1)] ?? null;
}

function detachItem(state: CanvasState, itemId: CanvasItemId): CanvasState {
  const pane = paneOf(state, itemId);
  if (!pane) return state;
  return withPane(state, {
    ...pane,
    itemIds: pane.itemIds.filter((id) => id !== itemId),
    activeItemId: nextActive(pane.itemIds, itemId, pane.activeItemId),
  });
}

function dropPane(state: CanvasState, paneId: CanvasPaneId): CanvasState {
  const layout = removePane(state.layout, paneId);
  if (!layout) return state; // never remove the last pane
  const panes = { ...state.panes };
  delete panes[paneId];
  const focusedPaneId = state.focusedPaneId === paneId ? (listPaneIds(layout)[0] ?? state.focusedPaneId) : state.focusedPaneId;
  return { ...state, layout, panes, focusedPaneId };
}

function addSplit(state: CanvasState, paneId: CanvasPaneId, orientation: CanvasOrientation): { state: CanvasState; newPaneId: CanvasPaneId } {
  const seq = state.seq + 1;
  const newPaneId = paneIdFromSeq(seq);
  const layout = splitPane(state.layout, paneId, newPaneId, orientation, splitIdFromSeq(seq));
  return {
    newPaneId,
    state: {
      ...state,
      seq,
      layout,
      panes: { ...state.panes, [newPaneId]: { id: newPaneId, itemIds: [], activeItemId: null } },
      focusedPaneId: newPaneId,
    },
  };
}

function insertInto(state: CanvasState, paneId: CanvasPaneId, itemId: CanvasItemId, activate: boolean, index?: number): CanvasState {
  const pane = state.panes[paneId];
  if (!pane) return state;
  const itemIds = [...pane.itemIds.filter((id) => id !== itemId)];
  const at = index === undefined ? afterActive(itemIds, pane.activeItemId) : Math.max(0, Math.min(index, itemIds.length));
  itemIds.splice(at, 0, itemId);
  return withPane(state, {
    ...pane,
    itemIds,
    activeItemId: activate || pane.activeItemId === null ? itemId : pane.activeItemId,
  });
}

/** New tabs open right after the active tab, the way browsers do it. */
function afterActive(itemIds: readonly CanvasItemId[], active: CanvasItemId | null): number {
  const index = active ? itemIds.indexOf(active) : -1;
  return index < 0 ? itemIds.length : index + 1;
}

function clampWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(CANVAS_MIN_WIDTH, Math.round(width)) : CANVAS_DEFAULT_WIDTH;
}

/**
 * Validates a persisted snapshot. Anything malformed is dropped back to the
 * initial state rather than half-applied — a corrupt layout must never crash
 * the shell.
 */
export function sanitizeCanvasSnapshot(raw: unknown): CanvasState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<CanvasState>;
  if (s.version !== 1 || !s.panes || !s.items || !s.layout) return null;
  const paneIds = new Set(Object.keys(s.panes));
  if (!isValidLayout(s.layout, paneIds)) return null;
  const layoutPanes = new Set<string>(listPaneIds(s.layout));
  if (layoutPanes.size !== paneIds.size) return null;
  const items: Record<string, CanvasItem> = {};
  for (const [id, item] of Object.entries(s.items)) {
    if (item && typeof item.kind === "string" && typeof item.key === "string" && canvasItemId(item.kind, item.key) === id) {
      items[id] = item;
    }
  }
  const panes: Record<string, CanvasPane> = {};
  for (const [id, pane] of Object.entries(s.panes)) {
    const itemIds = (Array.isArray(pane.itemIds) ? pane.itemIds : []).filter((itemId) => itemId in items);
    const activeItemId = pane.activeItemId && itemIds.includes(pane.activeItemId) ? pane.activeItemId : (itemIds[0] ?? null);
    panes[id] = { id: id as CanvasPaneId, itemIds, activeItemId };
  }
  const focused = s.focusedPaneId && paneIds.has(s.focusedPaneId) ? s.focusedPaneId : listPaneIds(s.layout)[0];
  if (!focused) return null;
  const seq = typeof s.seq === "number" && Number.isFinite(s.seq) ? s.seq : paneIds.size + 1;
  return {
    version: 1,
    isOpen: s.isOpen === true,
    isFullscreen: s.isFullscreen === true,
    width: clampWidth(typeof s.width === "number" ? s.width : CANVAS_DEFAULT_WIDTH),
    layout: s.layout,
    panes,
    items,
    focusedPaneId: focused,
    seq,
    hydrated: true,
  };
}

// ── reducer ────────────────────────────────────────────────────────────────

export function canvasReducer(state: CanvasState = createInitialCanvasState(), action: { type: string }): CanvasState {
  if (!isCanvasAction(action)) return state;
  switch (action.type) {
    case `${P}open`: {
      const { kind, key, title, data, target = "focused", reveal = true, activate = true, now } = action.payload;
      const itemId = canvasItemId(kind, key);
      const existing = state.items[itemId];
      let next = state;
      if (existing) {
        const item: CanvasItem = {
          ...existing,
          ...(data !== undefined ? { data } : {}),
          ...(title !== undefined ? { title } : {}),
          updatedAt: now,
        };
        next = { ...next, items: { ...next.items, [itemId]: item } };
        const pane = paneOf(next, itemId);
        if (pane && activate) next = { ...withPane(next, { ...pane, activeItemId: itemId }), focusedPaneId: pane.id };
        if (!pane) next = insertInto(next, next.focusedPaneId, itemId, true);
      } else {
        const item: CanvasItem = { id: itemId, kind, key, title: title ?? null, data: data ?? null, openedAt: now, updatedAt: now };
        next = { ...next, items: { ...next.items, [itemId]: item } };
        let paneId: CanvasPaneId = next.focusedPaneId;
        if (typeof target === "object" && next.panes[target.paneId]) {
          paneId = target.paneId;
        } else if (target === "split-right" || target === "split-down") {
          const split = addSplit(next, next.focusedPaneId, target === "split-right" ? "horizontal" : "vertical");
          next = split.state;
          paneId = split.newPaneId;
        }
        next = insertInto(next, paneId, itemId, activate);
        if (activate) next = { ...next, focusedPaneId: paneId };
      }
      return reveal ? { ...next, isOpen: true } : next;
    }
    case `${P}update`: {
      const { itemId, data, title, now } = action.payload;
      const item = state.items[itemId];
      if (!item) return state;
      return {
        ...state,
        items: {
          ...state.items,
          [itemId]: { ...item, ...(data !== undefined ? { data } : {}), ...(title !== undefined ? { title } : {}), updatedAt: now },
        },
      };
    }
    case `${P}closeItem`: {
      const { itemId } = action.payload;
      if (!state.items[itemId]) return state;
      const pane = paneOf(state, itemId);
      let next = detachItem(state, itemId);
      const items = { ...next.items };
      delete items[itemId];
      next = { ...next, items };
      // A pane emptied by closing its last tab goes away, unless it is the only one.
      if (pane && next.panes[pane.id]?.itemIds.length === 0) next = dropPane(next, pane.id);
      return next;
    }
    case `${P}closeOthers`: {
      const { itemId } = action.payload;
      const pane = paneOf(state, itemId);
      if (!pane) return state;
      const items = { ...state.items };
      for (const id of pane.itemIds) if (id !== itemId) delete items[id];
      return { ...withPane(state, { ...pane, itemIds: [itemId], activeItemId: itemId }), items };
    }
    case `${P}activate`: {
      const pane = paneOf(state, action.payload.itemId);
      if (!pane) return state;
      return { ...withPane(state, { ...pane, activeItemId: action.payload.itemId }), focusedPaneId: pane.id };
    }
    case `${P}focusPane`:
      return state.panes[action.payload.paneId] ? { ...state, focusedPaneId: action.payload.paneId } : state;
    case `${P}moveItem`: {
      const { itemId, toPaneId, index } = action.payload;
      const from = paneOf(state, itemId);
      if (!from || !state.panes[toPaneId]) return state;
      let next = from.id === toPaneId ? state : detachItem(state, itemId);
      next = insertInto(next, toPaneId, itemId, true, index);
      next = { ...next, focusedPaneId: toPaneId };
      if (from.id !== toPaneId && next.panes[from.id]?.itemIds.length === 0) next = dropPane(next, from.id);
      return next;
    }
    case `${P}splitPane`: {
      const { paneId, orientation, moveItemId } = action.payload;
      const pane = state.panes[paneId];
      if (!pane) return state;
      const split = addSplit(state, paneId, orientation);
      let next = split.state;
      // The new pane takes the requested tab when its old pane keeps something;
      // otherwise it starts empty and shows the launcher.
      if (moveItemId && pane.itemIds.includes(moveItemId) && pane.itemIds.length > 1) {
        next = detachItem(next, moveItemId);
        next = insertInto(next, split.newPaneId, moveItemId, true);
      }
      return next;
    }
    case `${P}closePane`: {
      const pane = state.panes[action.payload.paneId];
      if (!pane) return state;
      const onlyPane = listPaneIds(state.layout).length === 1;
      // Closing the last pane puts the canvas away and KEEPS its tabs — the
      // toggle brings everything back exactly as it was.
      if (onlyPane) return { ...state, isOpen: false, isFullscreen: false };
      const items = { ...state.items };
      for (const id of pane.itemIds) delete items[id];
      return dropPane({ ...state, items }, pane.id);
    }
    case `${P}resizeSplit`:
      return { ...state, layout: resizeSplit(state.layout, action.payload.splitId, action.payload.sizes) };
    case `${P}setOpen`:
      return action.payload.open === state.isOpen
        ? state
        : { ...state, isOpen: action.payload.open, isFullscreen: action.payload.open ? state.isFullscreen : false };
    case `${P}toggle`:
      return { ...state, isOpen: !state.isOpen, isFullscreen: state.isOpen ? false : state.isFullscreen };
    case `${P}setFullscreen`:
      return { ...state, isFullscreen: action.payload.fullscreen, isOpen: action.payload.fullscreen ? true : state.isOpen };
    case `${P}setWidth`:
      return { ...state, width: clampWidth(action.payload.width) };
    case `${P}hydrate`: {
      const snapshot = action.payload.snapshot ? sanitizeCanvasSnapshot(action.payload.snapshot) : null;
      if (!snapshot) return { ...state, hydrated: true };
      // Anything opened before hydration finished wins over the snapshot.
      let next: CanvasState = snapshot;
      for (const item of Object.values(state.items)) {
        const pane = paneOf(state, item.id);
        next = { ...next, items: { ...next.items, [item.id]: item } };
        if (!paneOf(next, item.id)) next = insertInto(next, next.focusedPaneId, item.id, pane?.activeItemId === item.id);
      }
      return { ...next, isOpen: next.isOpen || state.isOpen, hydrated: true };
    }
    case `${P}reset`:
      return { ...createInitialCanvasState(), hydrated: true };
    default:
      return state;
  }
}

