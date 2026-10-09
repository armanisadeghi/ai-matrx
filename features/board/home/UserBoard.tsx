"use client";

/**
 * UserBoard — a person's own board: the plane where ANYTHING the platform
 * supports can be put and worked on at once. Every tile is a registered item
 * type (`items/catalog.ts`) rendering the feature's canonical component — the
 * real chat, the real note, the real file — referenced by its source, never
 * copied.
 *
 * Ways in (one path each, all ending in `place()`):
 *   the Add menu and the Start panel  → start new / bring in any item type;
 *   the Sticky note / Text tools      → a sticky or plain text where you click
 *                                       (a double-click on empty board too);
 *   drop                              → files upload; links and text land;
 *   paste                             → links become pages, text a Note;
 *   agents                            → the board_* tools (BoardSurface).
 *
 * The host owns nothing but placement and the document: every change is
 * reported through `onChange` as a `BoardDocument` (the saved form).
 */

import { type ComponentType, type DragEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLink, PanelRight, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EntityCommentPopover } from "@/components/comments/EntityCommentPopover";
import { BOARD_TOKEN } from "../persistence/boardsService";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type Camera, type Rect, screenToWorld } from "../engine/camera";
import { useIsEditing, useIsLiveTile } from "../engine/react";
import { SurfaceActivity, createSurfaceCapture } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import type { BoardCameraStore } from "../engine/camera-store";
import type { ThrowAction, ThrowDirection } from "../engine/throw";
import { DEFAULT_THROW_ACTIONS } from "../engine/throw";
import { type BoardStore, useBoardLayout, useBoardStore, useBoardTile, useBoardView } from "../board/useBoard";
import type { PaceTier } from "../engine/lod";
import { useBoardKeys } from "../board/useBoardKeys";
import { BoardNavigationContext } from "../engine/tile-navigation";
import { appPagePath, pageSource, pageTitleFor } from "../items/page-items";
import { useWheelModePreference } from "../board/useWheelModePreference";
import { type BoardDocument, type NodeSource } from "../board/document";
import { BoardMenu } from "../components/BoardMenu";
import { BoardSurface } from "../components/BoardSurface";
import { BoardViewport } from "../components/BoardViewport";
import { BoardTile } from "../components/BoardTile";
import { BoardFrameView } from "../components/BoardFrameView";
import { ShapesLayer } from "../components/ShapesLayer";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { frameToolbarSection } from "../components/FrameToolbarSection";
import { selectionActionsSection, shapeStyleSection, sharedColorSection } from "../components/ShapeToolbarSections";
import { hitShape, isBoxed } from "../engine/shapes";
import { getPenStyle, PEN_DEFAULT } from "../engine/pen-style";
import { PenStyleBar } from "../components/PenStyleBar";
import { CreationLayer, type Creation } from "../components/CreationLayer";
import { stickyStyleSection, textStyleSection } from "../components/CanvasTextToolbarSections";
import { copyTileContent } from "../items/tile-copy";
import { createStickyOnBoard, createTextOnBoard } from "./canvas-text-create";
import { startStickyNoteSync } from "../board/sticky-notes";
import { stickyNoteStore } from "../persistence/sticky-note-store";
import { useBoardOrganizationId } from "../items/board-organization";
import { ToolBar } from "../components/ToolBar";
import { ZoomMenu } from "../components/ZoomMenu";
import { LayersPanel } from "../components/LayersPanel";
import { ParkedShelf } from "../components/ParkedShelf";
import { Minimap, ZoomHud } from "../components/BoardChrome";
import type { AddTileInput, BoardToolHost, EditTileInput } from "../tools/useBoardAgentTools";
import {
  createItemSurfaceIndex,
  ITEM_BASICS_SAMPLE_MS,
  sampleItemBasics,
  type ItemSurfaceIndex,
  type StoredBasics,
} from "../tools/item-surfaces";
import { BOARD_ITEM_TYPES, itemTypeFor } from "../items/catalog";
import { startNewEntries, type BoardItemType, type ItemBasicValues, type PickerProps, type PlacedItem, type StartNewEntry } from "../items/types";
import { filesToBoardItems } from "../items/file-drop";
import { noteSeedEdit } from "../items/work-sources";
import { intakeText } from "./board-intake";
import { type PlacementRun, placeTiles } from "./place-run";
import { planPlacement } from "../board/plan-placement";
import { AddMenu, StartPanel } from "./AddMenu";
import { StartTemplates } from "../templates/StartTemplates";
import { ReusedMarker, ReuseContext, useReuseIndex } from "../components/ReusedMarker";
import { resolvePresetTypes, type BoardPreset } from "../presets/board-preset";
import { UnavailableItemBody } from "./UnavailableItemBody";
import { createTileLinks, TileLinksProvider } from "../items/connected-sources";
import { StatusChip } from "../components/TileFace";
import { describeSelection } from "../board/selection-label";
import { runArrange, SHAPE_ARRANGE_GROUPS, SHAPE_GROUP_LABEL } from "../board/arrange-board";
import { groupMoveSet } from "../engine/selection";
import type { ArrangeCommand } from "../engine/arrange";
import type { ItemStatus, ItemStatusDoor } from "../items/types";

export interface UserBoardTile {
  id: string;
  rect: Rect;
  title: string;
  source: NodeSource;
  /** Last-known basics (`BoardNode.basics`): what an agent knows of the item while its tile sleeps. */
  basics?: StoredBasics;
}

/** An item's kind word and the agent surface its feature publishes (null for board-only content). */
function describeItem(source: NodeSource): { kind: string; surface: string | null } {
  const type = itemTypeFor(source);
  return {
    kind: type?.kindLabel ?? type?.key ?? "item",
    surface: type && "name" in type.surface ? type.surface.name : null,
  };
}

/** Down only takes a tile off this board — what it shows lives on. */
const BOARD_THROWS: Record<ThrowDirection, ThrowAction> = { ...DEFAULT_THROW_ACTIONS, up: "none", down: "remove" };
const CAMERA_SAVE_MS = 1200;

/**
 * The board re-renders only on STRUCTURE (`useBoardLayout`): a tile moving,
 * resizing or changing its content wakes that tile alone (`useBoardTile`).
 * Every prop a tile receives is stable (the store's methods, `onThrow`), so the
 * compiler's memoization holds and the page's save-status flips never reach a
 * tile body.
 */
export function UserBoard({
  boardId = null,
  title,
  doc,
  viewerCamera = null,
  onChange,
  onCamera,
  guest = false,
  preset,
}: {
  /** The saved board's id: comments on board-only tiles go on its thread. Null = no board record. */
  boardId?: string | null;
  title: string;
  /** The saved board this session starts from. */
  doc: BoardDocument;
  /** Where this person last looked at this board; null opens to fit everything. */
  viewerCamera?: Camera | null;
  /** Every change: a builder for the saved form, called only when a save goes out. */
  onChange: (build: () => BoardDocument) => void;
  /** The person's view, once it settles — their own, never board content. */
  onCamera?: (camera: Camera) => void;
  /** A meeting guest (no account): the Add menu and Start panel offer only `guestSafe` types. */
  guest?: boolean;
  /** A focus for this board (`presets/`): what the Add menu, Start panel and agent offer. None = every type. */
  preset?: BoardPreset;
}) {
  const guestTypes = guest ? BOARD_ITEM_TYPES.filter((t) => t.guestSafe) : BOARD_ITEM_TYPES;
  const presetTypes = resolvePresetTypes(preset, guestTypes);
  const addableTypes = presetTypes.featured;
  const moreTypes = presetTypes.more;
  const board = useBoardStore<UserBoardTile>(() => ({
    tiles: doc.nodes.map((n) => ({
      id: n.id,
      rect: n.rect,
      title: n.title,
      source: n.source,
      ...(n.basics ? { basics: n.basics } : {}),
    })),
    parked: doc.nodes.filter((n) => n.parked).map((n) => n.id),
    frames: doc.groups,
    shapes: doc.shapes,
  }));
  const layout = useBoardLayout(board);
  // "On N boards": one read of every saved board's tiles (not for a meeting guest or an unsaved board).
  const reuseIndex = useReuseIndex(boardId, !guest);
  // Sticky notes' words are Notes in the person's "Sticky notes" folder, filed in this board's
  // organization (board/sticky-notes.ts). A meeting guest or an unsaved board keeps them on the board.
  const boardOrganizationId = useBoardOrganizationId();
  useEffect(() => {
    if (!boardId || guest) return;
    return startStickyNoteSync(board, stickyNoteStore(boardOrganizationId), {
      onError: (e, what) =>
        toast.error(what === "read" ? "Sticky notes: couldn't load their latest words" : "Sticky note not saved to Notes yet", {
          description: e instanceof Error ? e.message : undefined,
        }),
    });
  }, [board, boardId, guest, boardOrganizationId]);
  const reuseValue = useMemo(() => (reuseIndex ? { index: reuseIndex, boardId } : null), [reuseIndex, boardId]);
  const [store, setStore] = useState<BoardCameraStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();
  const [layersOpen, setLayersOpen] = useState(false);
  // Every tile's own surface capture, live or dormant: how an agent reaches
  // any item on the board (board_items, board_open_item, board_item_act).
  const [itemSurfaces] = useState(createItemSurfaceIndex);
  // The open picker: a bring-in, or a start-new that needs one choice first.
  const [picking, setPicking] = useState<{
    title: string;
    Picker: ComponentType<PickerProps>;
    /** Set for a bring-in: its type's "Start new" entries sit beside the list. */
    type?: BoardItemType;
  } | null>(null);
  const [starting, setStarting] = useState<{ Dialog: ComponentType<PickerProps> } | null>(null);
  const [dropping, setDropping] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── the saved form ────────────────────────────────────────────────────────
  const toDoc = (camera: Camera): BoardDocument => {
    const now = board.read();
    const parkedIds = new Set(now.parked.map((t) => t.id));
    return {
      camera,
      nodes: [...now.tiles, ...now.parked].map((t) => ({
        id: t.id,
        rect: t.rect,
        title: t.title,
        source: t.source,
        ...(parkedIds.has(t.id) ? { parked: true } : {}),
        ...(t.basics ? { basics: t.basics } : {}),
      })),
      groups: now.frames,
      edges: [],
      shapes: board.shapes,
    };
  };
  const onChangeRef = useRef(onChange);
  const onCameraRef = useRef(onCamera);
  const toDocRef = useRef(toDoc);
  const storeRef = useRef(store);
  useEffect(() => {
    onChangeRef.current = onChange;
    onCameraRef.current = onCamera;
    toDocRef.current = toDoc;
    storeRef.current = store;
  });

  // Every change to the model is reported straight from the store — not from
  // a render — so saving never depends on (or causes) a board re-render. What
  // is reported is a BUILDER: a drag reports every pointer frame, and the
  // document is built once, when the debounced save actually goes out.
  // What the board looked like when it opened: a change made before this
  // effect subscribed (a tile body upgrading its source in its own mount
  // effect — children's effects run first) is reported once on subscribe.
  const [opened] = useState(() => ({ view: board.read(), camera: doc.camera }));
  useEffect(() => {
    const build = () => toDocRef.current(storeRef.current?.getCamera() ?? opened.camera);
    const report = () => onChangeRef.current(build);
    const unsubscribe = board.subscribe(report);
    if (board.read() !== opened.view) report();
    return unsubscribe;
  }, [board, opened]);

  // Last-known basics: while a tile is awake its brief is sampled into the saved board, so an agent
  // knows every item even when its tile is asleep or the board was just opened (`board_items`). Only a
  // change is written (`sampleItemBasics` returns nothing for unchanged basics — never a write loop),
  // without history (undo never sees it), and it rides the board's debounced autosave.
  useEffect(() => {
    let running = false;
    const sample = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const now = board.read();
        const tiles = [...now.tiles, ...now.parked].map((t) => ({
          id: t.id,
          title: t.title,
          ...describeItem(t.source),
          basics: t.basics,
        }));
        for (const update of await sampleItemBasics(tiles, itemSurfaces)) {
          board.updateTile(update.id, { basics: update.basics }, { history: false });
        }
      } finally {
        running = false;
      }
    };
    const first = setTimeout(sample, 2500);
    const every = setInterval(sample, ITEM_BASICS_SAMPLE_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [board, itemSurfaces]);

  // The person's view is kept once it settles (the URL hash follows it live).
  // It is THEIR view, not board content: it never goes into the saved board,
  // so panning here never makes another tab's edit a conflict.
  useEffect(() => {
    if (!store) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = store.getCamera();
    const keep = () => {
      timer = null;
      onCameraRef.current?.(store.getCamera());
    };
    const unsub = store.subscribeFrame(() => {
      const cam = store.getCamera();
      if (cam.x === last.x && cam.y === last.y && cam.z === last.z) return;
      last = cam;
      if (timer) clearTimeout(timer);
      timer = setTimeout(keep, CAMERA_SAVE_MS);
    });
    return () => {
      unsub();
      if (timer) {
        clearTimeout(timer);
        keep();
      }
    };
  }, [store]);

  // ── placing things — the ONE path every way in ends in ───────────────────
  const viewCentre = () => {
    if (!store) return { x: 0, y: 0 };
    const { w, h } = store.getSize();
    return screenToWorld(store.getCamera(), w / 2, h / 2);
  };

  /** The Add menu's Sticky note / Text rows: the same creator as the toolbar tools, at the view centre. */
  const addCanvasText = (kind: "sticky" | "text") => {
    if (!store) return;
    if (kind === "sticky") createStickyOnBoard(board, store);
    else createTextOnBoard(board, store);
  };

  // Successive adds fill the view in reading order while the view stays where
  // the last add left it (`home/place-run.ts`).
  const placementRun = useRef<PlacementRun | null>(null);
  /** `at`: a drop point — the nearest free spot there. Otherwise the run. Returns, per wanted
   * item, the tile that now shows it (`already`: it was on this board before) — or null for the
   * same record twice in one add. `agent`: an agent's add never takes the view or the selection
   * from a tile the person is working in. */
  const place = (
    wanted: PlacedItem[],
    at?: { x: number; y: number },
    opts: { agent?: boolean } = {},
  ): ({ id: string; already: boolean } | null)[] => {
    const busy = opts.agent && store ? (store.getEditing() ?? store.getFocused()) : null;
    const { tiles, results, already } = planPlacement(
      wanted,
      [...board.read().tiles, ...board.read().parked],
      itemTypeFor,
    );
    if (already.length > 0) {
      const target = already[already.length - 1];
      if (board.getLayout().parkedIds.includes(target)) board.unparkTile(target);
      toast(already.length === 1 ? "Already on this board" : `${already.length} were already on this board`);
      if (tiles.length === 0 && store && !busy) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            store.select(target);
            store.fitItem(target, 80);
          }),
        );
      }
    }
    if (tiles.length === 0) return results;
    if (!store) {
      for (const tile of tiles) board.addTile(tile, at ?? { x: 0, y: 0 });
      return results;
    }
    const view = { camera: store.getCamera(), size: store.getSize(), insets: store.getInsets() };
    const placed = placeTiles(board, tiles, view, placementRun.current, at);
    placementRun.current = placed.run;
    const target = tiles[tiles.length - 1].id;
    // The tile registers on its next render: then select it so the person can
    // start on it at once, and pan just enough to show it if it is off screen.
    if (!busy) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          store.select(target);
          if (placed.reveal) store.flyTo(placed.reveal, 320);
        }),
      );
    }
    return results;
  };

  const startNew = (_type: BoardItemType, entry: StartNewEntry) => {
    setPicking(null);
    if ("create" in entry) place([entry.create()]);
    else if ("Dialog" in entry) setStarting({ Dialog: entry.Dialog });
    else setPicking({ title: entry.label, Picker: entry.Picker });
  };
  // Bringing something in always offers starting a new one beside the list —
  // every type's own "Start new" entries, so no picker is a dead end.
  const bringIn = (type: BoardItemType) => {
    if (type.bringIn) setPicking({ title: `Bring in: ${type.bringIn.label}`, Picker: type.bringIn.Picker, type });
  };

  // THE MENU'S SUB-OPTIONS: `/board?add=<item key>` starts that item at once — its first "new"
  // entry, else its "bring in" picker — then drops the parameter so a reload adds nothing.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addKey = guest ? null : searchParams.get("add");
  const addHandled = useRef<string | null>(null);
  useEffect(() => {
    // The parameter is dropped once handled; when it is gone, the next click on the same
    // menu row (same key) is a new request, not a repeat of this render's.
    if (!addKey) {
      addHandled.current = null;
      return;
    }
    if (!store || addHandled.current === addKey) return;
    addHandled.current = addKey;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("add");
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
    const type = addableTypes.find((t) => t.key === addKey);
    if (!type) {
      toast.error(`A board cannot add "${addKey}"`);
      return;
    }
    const [entry] = startNewEntries(type);
    if (entry) startNew(type, entry);
    else bringIn(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addKey, store]);

  /** The tile under a world point, if any. */
  const tileAtPoint = (p: { x: number; y: number }) =>
    board
      .read()
      .tiles.find((t) => p.x >= t.rect.x && p.x <= t.rect.x + t.rect.w && p.y >= t.rect.y && p.y <= t.rect.y + t.rect.h);
  /** A rectangle / oval under a world point (topmost), if any — an arrow end binds to it. */
  const boxShapeAtPoint = (p: { x: number; y: number }) => {
    const shapes = board.getShapes();
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (isBoxed(shapes[i].kind) && hitShape(shapes[i], p, 0, board.targetOf)) return shapes[i];
    }
    return undefined;
  };

  const onCreate = (c: Creation) => {
    const id = `${c.tool}:${crypto.randomUUID().slice(0, 8)}`;
    switch (c.tool) {
      // Words on the canvas (a sticky note, plain text): made, selected and typing at once.
      // A full Note stays in the Add menu ("Note"); the sticky tool never makes a Note tile.
      case "sticky":
        if (store) createStickyOnBoard(board, store, c.at);
        return;
      case "text":
        if (store) createTextOnBoard(board, store, c.at);
        return;
      case "frame":
        board.addFrame({ id, rect: c.rect, title: "Frame" });
        break;
      case "rect":
      case "rounded":
      case "oval":
      case "triangle":
      case "diamond":
      case "star":
        board.addShape({ id, kind: c.tool, points: [{ x: c.rect.x, y: c.rect.y }, { x: c.rect.x + c.rect.w, y: c.rect.y + c.rect.h }] });
        break;
      case "arrow":
      case "line": {
        // An arrow drawn from one tile onto another is a connection (a chat tile reads the other tile as
        // context, in either direction) — and it is a bound arrow shape like every other connector
        // (`board/connections.ts`). Drawings sit above tiles, so a box shape under an end is the nearer target.
        const fromShape = boxShapeAtPoint(c.from);
        const toShape = boxShapeAtPoint(c.to);
        const from = fromShape ? undefined : tileAtPoint(c.from);
        const to = toShape ? undefined : tileAtPoint(c.to);
        if (c.tool === "arrow" && from && to && from.id !== to.id) {
          if (board.connections.some((x) => x.from === from.id && x.to === to.id)) {
            toast(`"${from.title}" is already connected to "${to.title}"`);
            return;
          }
          toast(`Connected "${from.title}" to "${to.title}"`);
        }
        // An end dropped on a tile or a rectangle / oval BINDS to it and follows it (tldraw).
        const start = fromShape?.id ?? from?.id;
        const end = toShape?.id ?? to?.id;
        const bind = start !== end && (start || end) ? { ...(start ? { start } : {}), ...(end ? { end } : {}) } : undefined;
        board.addShape({ id, kind: c.tool, points: [c.from, c.to], ...(bind ? { bind } : {}) });
        break;
      }
      case "pen":
        {
          // The pen's colour and weight (PenStyleBar); stored partial, like every style.
          const pen = getPenStyle();
          const style = { ...(pen.stroke !== PEN_DEFAULT.stroke ? { stroke: pen.stroke } : {}), ...(pen.size !== PEN_DEFAULT.size ? { size: pen.size } : {}) };
          board.addShape({ id, kind: "pen", points: c.points, ...(Object.keys(style).length ? { style } : {}) });
        }
        break;
      case "eraser":
        board.removeMany(c.ids);
        if (store && c.ids.some((x) => store.isSelected(x))) store.select(null);
        return;
    }
    requestAnimationFrame(() => store?.select(id));
  };

  // ── drop and paste ────────────────────────────────────────────────────────
  const worldAt = (clientX: number, clientY: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!store || !box) return viewCentre();
    return screenToWorld(store.getCamera(), clientX - box.left, clientY - box.top);
  };

  const placeFiles = async (files: File[], at?: { x: number; y: number }) => {
    const label = files.length === 1 ? `"${files[0].name}"` : `${files.length} files`;
    toast(`Uploading ${label} to your board…`);
    const items = await filesToBoardItems(files);
    if (items.length > 0) place(items, at);
  };

  const onDragOver = (e: DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes("Files") && !types.includes("text/uri-list") && !types.includes("text/plain")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dropping) setDropping(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const near = worldAt(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      void placeFiles(files, near);
      return;
    }
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    const items = intakeText(text);
    if (items.length > 0) place(items, near);
  };

  const onPaste = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if (store?.getEditing()) return; // a tile's own content owns the paste
    if (!rootRef.current?.isConnected) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void placeFiles(files);
      return;
    }
    const items = intakeText(e.clipboardData?.getData("text/plain") ?? "");
    if (items.length === 0) return;
    e.preventDefault();
    place(items);
  };
  const onPasteRef = useRef(onPaste);
  useEffect(() => {
    onPasteRef.current = onPaste;
  });
  useEffect(() => {
    const handler = (e: ClipboardEvent) => onPasteRef.current(e);
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  // ── what a throw, a menu item or a key does ──────────────────────────────
  const tileOf = (id: string) => board.getTile(id);
  const park = (id: string) => {
    const undo = board.parkTile(id);
    toast(`Parked "${tileOf(id)?.title ?? "tile"}"`, { action: { label: "Undo", onClick: undo } });
  };
  // A selection goes as ONE undoable step (the menu's multi-selection items).
  const parkMany = (ids: string[]) => {
    const tiles = ids.filter((id) => tileOf(id));
    if (tiles.length === 0) return;
    board.batch(() => tiles.forEach((id) => board.parkTile(id)));
    toast(`Parked ${tiles.length} tiles`, { action: { label: "Undo", onClick: board.undo } });
  };
  const takeOffMany = (ids: string[]) => {
    const tiles = ids.filter((id) => tileOf(id));
    if (tiles.length === 0) return;
    board.batch(() => tiles.forEach((id) => board.removeTile(id)));
    toast(`Took ${tiles.length} tiles off the board — they still exist where they live`, {
      action: { label: "Undo", onClick: board.undo },
    });
  };
  const unpark = (id: string) => {
    board.unparkTile(id);
    requestAnimationFrame(() => requestAnimationFrame(() => store?.fitItem(id)));
  };
  const takeOff = (id: string) => {
    const t = tileOf(id);
    const undo = board.removeTile(id);
    toast(`Took "${t?.title ?? "tile"}" off the board — it still exists where it lives`, {
      action: { label: "Undo", onClick: undo },
    });
  };
  const handleThrow = (id: string, direction: ThrowDirection) => {
    const action = BOARD_THROWS[direction];
    if (action === "park") park(id);
    else if (action === "remove") takeOff(id);
  };
  const throwRef = useRef(handleThrow);
  useEffect(() => {
    throwRef.current = handleThrow;
  });
  // Stable (it closes over a ref only), so a tile never re-renders because its host did.
  const onThrow = (id: string, direction: ThrowDirection) => throwRef.current(id, direction);
  // A frame goes as one undoable step; its tiles stay where they are.
  const deleteFrame = (id: string) => {
    const frame = board.frames.find((f) => f.id === id);
    if (!frame) return;
    board.removeFrame(id);
    if (store?.getSelected() === id) store.select(null);
    toast(`Deleted frame "${frame.title}" — its tiles stay`, { action: { label: "Undo", onClick: board.undo } });
  };
  // "Delete with contents" (a frame's menu): the frame and every tile inside it, one undo step.
  const deleteFrameWithContents = (id: string) => {
    const frame = board.frames.find((f) => f.id === id);
    if (!frame) return;
    const inside = groupMoveSet([id], store?.getItems() ?? new Map()).keys();
    const tiles = [...inside].filter((x) => tileOf(x));
    board.removeMany([...tiles, id]);
    store?.select(null);
    toast(`Deleted frame "${frame.title}" and ${tiles.length === 1 ? "its tile" : `its ${tiles.length} tiles`}`, {
      action: { label: "Undo", onClick: board.undo },
    });
  };
  // Delete / Backspace: everything selected, ONE undo step. A frame goes alone — its tiles
  // stay unless they were selected too ("Delete with contents" is in the frame's menu).
  const deleteSelected = () => {
    const ids = store?.getSelection() ?? [];
    if (ids.length === 0) return;
    if (ids.length === 1) {
      const id = ids[0];
      if (board.getShape(id)) {
        board.removeShape(id);
        store?.select(null);
      }
      else if (board.frames.some((f) => f.id === id)) deleteFrame(id);
      else if (tileOf(id)) takeOff(id);
      return;
    }
    const tiles = ids.filter((id) => tileOf(id));
    const frames = ids.filter((id) => board.frames.some((f) => f.id === id));
    const marks = ids.filter((id) => board.getShape(id));
    board.removeMany(ids);
    store?.select(null);
    const parts = [
      tiles.length ? `${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"}` : "",
      frames.length ? `${frames.length} ${frames.length === 1 ? "frame" : "frames"}` : "",
      marks.length ? `${marks.length} ${marks.length === 1 ? "drawing" : "drawings"}` : "",
    ].filter(Boolean);
    toast(`Took ${parts.join(" and ")} off the board`, { action: { label: "Undo", onClick: board.undo } });
  };
  // Arrange (Board menu → Arrange, and its keys): 2+ selected → the selection, else the whole
  // board; frames move with their tiles, one undo step.
  const arrangeOptions = () => ({
    groupOf: (t: UserBoardTile) => itemTypeFor(t.source)?.key ?? "unavailable",
    order: [...BOARD_ITEM_TYPES.map((t) => t.key), ...SHAPE_ARRANGE_GROUPS],
    frameTitle: (group: string) =>
      SHAPE_GROUP_LABEL[group as keyof typeof SHAPE_GROUP_LABEL] ??
      typeFrameTitle(BOARD_ITEM_TYPES.find((t) => t.key === group)?.label),
    root: rootRef.current,
  });
  const arrangeBoard = (command: ArrangeCommand) => {
    const selection = store?.getSelection() ?? [];
    const moved = runArrange(board, command, {
      ...arrangeOptions(),
      ...(selection.length > 1 ? { only: selection } : {}),
    });
    if (moved === 0) toast("Already arranged that way");
  };
  // The frame toolbar's "Arrange inside": tidy what the frame holds (the frame itself stays put).
  const arrangeInside = (ids: string[]) => {
    if (ids.length < 2) return void toast("Nothing to arrange in this frame");
    if (runArrange(board, { kind: "layout", layout: "tidy" }, { ...arrangeOptions(), only: ids }) === 0) {
      toast("Already arranged that way");
    }
  };
  // Group gestures (a multi-selection drag, a frame carrying its tiles, arrow nudges) move
  // through the board model as one undo step.
  useEffect(() => store?.registerMover({ dragMany: board.dragMany }), [store, board]);
  // ⌘D / the toolbar's Duplicate: copies of the selected drawings, sticky notes and text (selected after),
  // and of the selected TILES where the content can be copied (`items/tile-copy.ts`): board-only content
  // and chats copy, a note or document copies through its own copy action, any other record is already
  // on the board ("Already on this board") and is skipped. Returns false when nothing was selectable.
  const duplicateTiles = async (ids: string[]) => {
    const skipped: string[] = [];
    try {
      for (const id of ids) {
        const tile = tileOf(id);
        if (!tile) continue;
        const copy = await copyTileContent({ title: tile.title, source: tile.source });
        if (!copy) {
          skipped.push(id);
          continue;
        }
        const { x, y, w, h } = tile.rect;
        place([{ title: copy.title, source: copy.source, size: { w, h } }], { x: x + w + 24 + w / 2, y: y + h / 2 });
      }
    } catch (e) {
      toast.error("Couldn't duplicate that tile", { description: e instanceof Error ? e.message : undefined });
    }
    if (skipped.length > 0) toast(skipped.length === 1 ? "Already on this board" : `${skipped.length} were already on this board`);
  };
  const duplicateSelected = (): boolean => {
    const selection = store?.getSelection() ?? [];
    const shapeIds = selection.filter((id) => board.getShape(id));
    const tileIds = selection.filter((id) => tileOf(id));
    if (shapeIds.length === 0 && tileIds.length === 0) return false;
    if (shapeIds.length > 0) {
      const copies = board.duplicateShapes(shapeIds);
      requestAnimationFrame(() => store?.setSelection(copies));
    }
    if (tileIds.length > 0) void duplicateTiles(tileIds);
    return true;
  };
  // ⌘] / ⌘[: layer order of the selected drawings and tiles (each among its own kind).
  const reorderSelected = (dir: "forward" | "backward" | "front" | "back") => {
    const selection = store?.getSelection() ?? [];
    board.batch(() => {
      board.reorderShapes(selection.filter((id) => board.getShape(id)), dir);
      board.reorderTiles(selection.filter((id) => tileOf(id)), dir);
    });
  };
  useBoardKeys({
    undo: board.undo,
    redo: board.redo,
    deleteSelected,
    enabled: () => !store?.getEditing(),
    arrange: arrangeBoard,
    duplicate: duplicateSelected,
    reorder: reorderSelected,
  });
  const toolbarSections = [
    stickyStyleSection(board),
    textStyleSection(board),
    shapeStyleSection(board),
    frameToolbarSection({ board, arrangeInside }),
    sharedColorSection(board),
    selectionActionsSection({ board, duplicate: duplicateSelected, remove: deleteSelected }),
  ];

  // ── agents: the board_* tools act through the same paths ─────────────────
  const agentHost: BoardToolHost<UserBoardTile> = {
    board,
    store,
    boardTitle: title,
    itemSurfaces,
    storedBasics: (tile) => tile.basics ?? null,
    createTile: (id, input, size) => agentTile(id, input, size),
    // board_add_items / board_find_records: the catalog, and the ONE placement path every way in uses.
    itemTypes: preset ? presetTypes.allowed : BOARD_ITEM_TYPES,
    placeItems: (batch) => {
      const out: ({ id: string; already: boolean } | null)[] = new Array(batch.length).fill(null);
      const flowing = batch.flatMap((b, i) => (b.at ? [] : [i]));
      place(flowing.map((i) => batch[i].item), undefined, { agent: true }).forEach((r, k) => (out[flowing[k]] = r));
      batch.forEach((b, i) => {
        if (b.at) out[i] = place([b.item], b.at, { agent: true })[0] ?? null;
      });
      return out;
    },
    editTile: (tile, input) => agentEdit(tile, input),
    describe: (tile) => describeItem(tile.source),
  };

  // Lines are context: a chat tile reads which tiles are joined to it, and builds its own context
  // from the live board (`items/connected-sources.tsx`). Stable; reads the latest host at call time.
  const hostRef = useRef(agentHost);
  useEffect(() => {
    hostRef.current = agentHost;
  });
  const [links] = useState(() =>
    createTileLinks<UserBoardTile>({
      board,
      host: () => hostRef.current,
      focus: (id) => {
        const s = storeRef.current;
        if (!s) return;
        s.select(id);
        s.fitItem(id, 80);
      },
    }),
  );

  // A page a tile opens lands on THIS board as a page tile (engine/tile-navigation.tsx);
  // a record already here is shown instead (place → recordKeyOf).
  const boardNavigation = {
    openOnBoard: (path: string) => {
      const page = appPagePath(path, window.location.origin);
      if (!page) return false;
      place([{ title: pageTitleFor(page), source: pageSource(page) }]);
      return true;
    },
  };
  // The Start panel steps aside once ANYTHING is on the board — a tile, a frame or a drawing.
  const hasShapes = useSyncExternalStore(
    board.subscribeShapes,
    () => board.getShapes().length > 0,
    () => board.getShapes().length > 0,
  );
  const empty = layout.tileIds.length === 0 && layout.parkedIds.length === 0 && layout.frames.length === 0 && !hasShapes;
  const parkedTiles = layout.parked;

  return (
    <TileLinksProvider value={links}>
    <BoardSurface host={agentHost}>
      <BoardMenu
        store={store}
        tilesOf={(ids) => ids.filter((id) => tileOf(id))}
        actions={{ park, remove: takeOff, parkMany, removeMany: takeOffMany, removeLabel: "Take off this board" }}
        frameActions={{ remove: deleteFrame, removeWithContents: deleteFrameWithContents }}
        parked={parkedTiles.map((t) => ({ id: t.id, title: t.title }))}
        onUnpark={unpark}
        wheelMode={wheelMode}
        onWheelMode={setWheelMode}
        onArrange={arrangeBoard}
        boardTitle={title}
        describeSelection={(ids) =>
          describeSelection(ids, (id) => {
            const sh = board.getShape(id);
            if (sh) return sh.kind;
            if (board.frames.some((f) => f.id === id)) return "frame";
            return board.getTile(id) ? "tile" : undefined;
          })
        }
        objectActions={{
          duplicate: () => void duplicateSelected(),
          front: () => reorderSelected("front"),
          back: () => reorderSelected("back"),
          remove: deleteSelected,
        }}
      >
        <div
          ref={rootRef}
          className="relative h-full min-h-0"
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropping(false);
          }}
          onDrop={onDrop}
        >
          <ReuseContext.Provider value={reuseValue}>
          <BoardNavigationContext.Provider value={boardNavigation}>
          <BoardViewport
            initialCamera={viewerCamera ?? doc.camera}
            fitOnMount={viewerCamera === null && (doc.nodes.length > 0 || doc.shapes.length > 0 || doc.groups.length > 0)}
            insets={{ top: 72, bottom: 56 }}
            wheelMode={wheelMode}
            onStore={setStore}
            onEmptyDoubleClick={(at) => {
              if (store && !guest) createTextOnBoard(board, store, at);
            }}
            overlay={
              <>
                <CreationLayer onCreate={onCreate} />
                <SelectionToolbar sections={toolbarSections} />
                <ToolBar tools={preset?.toolbar} leading={<AddMenu types={addableTypes} more={moreTypes} onStartNew={startNew} onBringIn={bringIn} onCanvasText={addCanvasText} />} />
                <div
                  data-board-chrome
                  className="absolute right-4 top-4 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur"
                >
                  <button
                    type="button"
                    onClick={() => setLayersOpen((o) => !o)}
                    aria-pressed={layersOpen}
                    title="Layers"
                    aria-label="Layers"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                      layersOpen && "bg-primary/15 text-primary-ink",
                    )}
                  >
                    <PanelRight className="h-4 w-4" />
                  </button>
                  <span className="mx-0.5 h-5 w-px bg-border" />
                  <ZoomMenu
                    history={{ canUndo: layout.canUndo, canRedo: layout.canRedo, undo: board.undo, redo: board.redo }}
                  />
                </div>
                {layersOpen && <BoardLayers board={board} onClose={() => setLayersOpen(false)} />}
                <ParkedShelf
                  className={layersOpen ? "right-72 top-16" : "top-16"}
                  parked={parkedTiles.map((t) => ({
                    id: t.id,
                    title: t.title,
                    icon: itemTypeFor(t.source)?.icon ?? PanelRight,
                  }))}
                  onRestore={unpark}
                />
                {empty && (
                  <StartPanel
                    types={addableTypes}
                    more={moreTypes}
                    onStartNew={startNew}
                    onBringIn={bringIn}
                    templates={boardId && !guest ? <StartTemplates starterKey={typeof preset?.starter === "string" ? preset.starter : undefined} /> : undefined}
                  />
                )}
                {dropping && (
                  <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5">
                    <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg">
                      Drop to put it on your board
                    </span>
                  </div>
                )}
                <PenStyleBar />
                <ZoomHud />
                <Minimap />
              </>
            }
          >
            {layout.frames.map((f) => (
              <BoardFrameView
                key={f.id}
                {...f}
                onResize={board.resizeTile}
                onRename={(id, next) => board.updateFrame(id, { title: next })}
              />
            ))}
            {layout.tileIds.map((id) => (
              <BoardItemTile
                key={id}
                id={id}
                board={board}
                boardRecord={boardId ? { id: boardId, title } : null}
                itemSurfaces={itemSurfaces}
                onThrow={onThrow}
              />
            ))}
            {/* Drawings render ABOVE tiles (frames < tiles < drawings), so a stroke over a tile stays visible. */}
            <ShapesLayer board={board} />
          </BoardViewport>
          </BoardNavigationContext.Provider>
          </ReuseContext.Provider>
        </div>
      </BoardMenu>
      <Dialog open={picking !== null} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle>{picking?.title ?? "Bring in"}</DialogTitle>
            {picking?.type ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {startNewEntries(picking.type).map((entry, i) => {
                  const type = picking.type as BoardItemType;
                  const Icon = entry.icon ?? Plus;
                  return (
                    <Button
                      icon={<Icon />}
                      key={`${type.key}:${i}`}
                      type="button"
                      variant={i === 0 ? "primary" : "outline"}
                      onClick={() => startNew(type, entry)}
                    >
                      {newLabel(type, entry)}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </DialogHeader>
          {picking && (
            <picking.Picker
              onPick={(items) => {
                setPicking(null);
                place(items);
              }}
              onCancel={() => setPicking(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {starting && (
        <starting.Dialog
          onPick={(items) => {
            setStarting(null);
            place(items);
          }}
          onCancel={() => setStarting(null)}
        />
      )}
    </BoardSurface>
    </TileLinksProvider>
  );
}

/** A type frame's title: the type, plural ("Notes", "War Rooms"). */
function typeFrameTitle(label: string | undefined): string {
  if (!label) return "Other";
  return /(s|Research|notes)$/.test(label) ? label : `${label}s`;
}

/** The tile's status chip: the type's `status.useStatus` hook, in its own leaf (a tick never re-renders the body). */
function statusRenderer(key: string, door: ItemStatusDoor, source: NodeSource, basics?: ItemBasicValues | null) {
  if (!("useStatus" in door)) return undefined;
  return (variant: "header" | "face", animate: boolean) => (
    <ItemStatusLeaf key={key} useStatus={door.useStatus} source={source} basics={basics} variant={variant} animate={animate} />
  );
}

function ItemStatusLeaf({
  useStatus,
  source,
  basics,
  variant,
  animate,
}: {
  useStatus: (source: NodeSource, basics?: ItemBasicValues | null) => ItemStatus | null;
  source: NodeSource;
  basics?: ItemBasicValues | null;
  variant: "header" | "face";
  animate: boolean;
}) {
  const status = useStatus(source, basics);
  return status ? <StatusChip status={status} variant={variant} animate={animate} /> : null;
}

/** "New meeting", "Chat with an agent": an entry already led by a verb keeps its own words. */
function newLabel(type: BoardItemType, entry: StartNewEntry): string {
  if (/^(new|start|run|chat with)\b/i.test(entry.label)) return entry.label;
  return entry.label === type.label ? `New ${type.label.toLowerCase()}` : entry.label;
}

/** The layers list reads every tile, so it alone re-renders on every change — only while open. */
function BoardLayers({ board, onClose }: { board: BoardStore<UserBoardTile>; onClose: () => void }) {
  const view = useBoardView(board);
  return (
    <LayersPanel
      frames={view.frames.map((f) => ({ id: f.id, title: f.title, rect: f.rect }))}
      tiles={view.tiles.map((t) => ({
        id: t.id,
        title: t.title,
        rect: t.rect,
        icon: itemTypeFor(t.source)?.icon ?? PanelRight,
      }))}
      shapeCount={board.shapes.length}
      onRename={(id, next) => {
        if (board.frames.some((f) => f.id === id)) board.updateFrame(id, { title: next });
        else board.updateTile(id, { title: next });
      }}
      onClose={onClose}
    />
  );
}

/** A source that names nothing yet: an entity with no id and no meta. */
const isEmptyEntity = (s: NodeSource): boolean => s.kind === "entity" && s.id === null && !s.meta;

/**
 * One tile, subscribed to ITS record only: a drag or resize re-renders this
 * frame and nothing else. The body depends on the tile's source and title, not
 * its rect, so moving a tile never re-renders what it shows.
 */
function BoardItemTile({
  id,
  board,
  boardRecord,
  itemSurfaces,
  onThrow,
}: {
  id: string;
  board: BoardStore<UserBoardTile>;
  /** The saved board (comments on board-only tiles go on its thread). */
  boardRecord: { id: string; title: string } | null;
  itemSurfaces: ItemSurfaceIndex;
  onThrow: (id: string, direction: ThrowDirection) => void;
}) {
  const tile = useBoardTile(board, id);
  const interacting = useIsEditing(id);
  // THE live tile (full screen, else worked in, else selected) is the only one
  // whose feature surface registers; every other copy stays dormant.
  const live = useIsLiveTile(id);
  // The tile's own copy of its surface, registered live or dormant, so an
  // agent can read and act on it without the person switching to it.
  const [capture] = useState(createSurfaceCapture);
  useEffect(() => itemSurfaces.set(id, capture), [itemSurfaces, id, capture]);
  if (!tile) return null;
  const source = tile.source;
  const title = tile.title;
  const type = itemTypeFor(source);
  const href = type?.href?.(source) ?? null;
  const onSource = (next: NodeSource, nextTitle?: string) => {
    board.updateTile(id, nextTitle ? { source: next, title: nextTitle } : { source: next }, { history: false });
    // A compact empty tile (a template's "paste a link" tile) grows to its type's size once it has something to show.
    const size = type?.defaultSize;
    if (type?.growOnFill && size && isEmptyEntity(source) && !isEmptyEntity(next) && (tile.rect.w < size.w || tile.rect.h < size.h)) {
      board.resizeTile(id, { ...tile.rect, w: Math.max(tile.rect.w, size.w), h: Math.max(tile.rect.h, size.h) });
    }
  };
  const Keep = type?.Keep;
  return (
    <>
      {Keep && <Keep tileId={id} source={source} />}
      <BoardTile
        id={id}
        rect={tile.rect}
        title={title}
        subtitle={type?.label ?? "Unavailable"}
        icon={type?.icon}
        accent={type?.accent}
        typeLabel={type?.label ?? "Unavailable"}
        renderStatus={type ? statusRenderer(type.key, type.status, source, tile.basics?.values) : undefined}
        onMove={board.moveTile}
        onResize={board.resizeTile}
        onThrow={onThrow}
        throwActions={BOARD_THROWS}
        sleeps={type?.sleeps ?? false}
        titleSlot={type?.TitleField ? <type.TitleField tileId={id} source={source} title={title} /> : undefined}
        actions={
          <>
            {type?.HeaderAction && <type.HeaderAction tileId={id} source={source} width={tile.rect.w} onSource={onSource} />}
            <ReusedMarker source={source} />
            <TileCommentDoor tileId={id} type={type} source={source} title={title} boardRecord={boardRecord} />
            {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              title="Open in its own page"
              aria-label={`Open ${title} in its own page`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            ) : null}
          </>
        }
      >
        {(tier) => (
          <TileContent
            tileId={id}
            source={source}
            title={title}
            tier={itemTypeFor(source)?.usesTier ? tier : "read"}
            interacting={interacting}
            live={live}
            capture={capture}
            onSource={onSource}
          />
        )}
      </BoardTile>
    </>
  );
}

/**
 * The tile's ONE comment door. A record tile opens its record's own thread —
 * the same thread its page shows. Board-only content (a write-up, an image, a
 * web page) and record types with no thread of their own comment on the board
 * record, anchored to the tile (`part_anchor` `tile:<tile id>`): the tile's
 * thread shows only that tile's comments, and the remark names the tile. A
 * record that does not exist yet (a draft) has nothing to comment on: no door.
 */
function TileCommentDoor({
  tileId,
  type,
  source,
  title,
  boardRecord,
}: {
  tileId: string;
  type: BoardItemType | null;
  source: NodeSource;
  title: string;
  boardRecord: { id: string; title: string } | null;
}) {
  if (!type) return null;
  if (type.comments) {
    const record = type.comments(source);
    return record ? <EntityCommentPopover token={record.token} id={record.id} title={title} className="h-7" /> : null;
  }
  if (!boardRecord) return null;
  return (
    <EntityCommentPopover
      token={BOARD_TOKEN}
      id={boardRecord.id}
      title={`${boardRecord.title} — tile “${title}”`}
      part={{ key: `tile:${tileId}`, label: title }}
      showCount={false}
      className="h-7"
    />
  );
}

/** What a tile shows. Its props never include the rect, so a move or resize
 * re-renders the frame around it and this returns its cached output. */
function TileContent({
  tileId,
  source,
  title,
  tier,
  interacting,
  live,
  capture,
  onSource,
}: {
  tileId: string;
  source: NodeSource;
  title: string;
  tier: PaceTier;
  interacting: boolean;
  live: boolean;
  capture: ReturnType<typeof createSurfaceCapture>;
  onSource: (source: NodeSource, title?: string) => void;
}) {
  const type = itemTypeFor(source);
  if (!type) return <UnavailableItemBody source={source} />;
  const Host = "name" in type.surface ? type.surface.Host : undefined;
  const body = (
    <type.Body tileId={tileId} source={source} title={title} tier={tier} interacting={interacting} onSource={onSource} />
  );
  return (
    <SurfaceActivity active={live} capture={capture}>
      {Host ? <Host source={source}>{body}</Host> : body}
    </SurfaceActivity>
  );
}

// ── what the board's agent tools make and change ────────────────────────────

function agentTile(
  id: string,
  input: AddTileInput,
  size: { w: number; h: number },
): UserBoardTile | { ok: false; error: string } {
  const rect = { x: 0, y: 0, ...size };
  switch (input.kind) {
    case "note":
      return {
        id,
        rect,
        title: input.title ?? "Note",
        source: { kind: "entity", entity: "note", id: null, ...(input.text ? { meta: { seed: input.text } } : {}) },
      };
    case "markdown":
      if (!input.text) return { ok: false, error: "A markdown tile needs `text`." };
      return { id, rect, title: input.title ?? "Write-up", source: { kind: "text", markdown: input.text } };
    case "text":
      // Plain text is a canvas object, not a tile: board_add_tile makes it through the board's shapes.
      return { ok: false, error: "Plain text is placed on the canvas itself; this board cannot hold it." };
    case "html":
      if (input.html) return { id, rect, title: input.title ?? "Page", source: { kind: "html", html: input.html } };
      if (input.url) return { id, rect, title: input.title ?? "Page", source: { kind: "html", url: input.url } };
      return { ok: false, error: "An html tile needs `html` (a complete document) or `url`." };
    case "image":
      if (!input.url) return { ok: false, error: "An image tile needs `url`." };
      return { id, rect, title: input.title ?? "Image", source: { kind: "image", url: input.url } };
  }
}

function agentEdit(tile: UserBoardTile, input: EditTileInput): Partial<UserBoardTile> | { ok: false; error: string } {
  const s = tile.source;
  if (s.kind === "text" && input.text !== undefined) return { source: { kind: "text", markdown: input.text } };
  if (s.kind === "label" && input.text !== undefined) return { source: { kind: "label", text: input.text } };
  if (s.kind === "html" && input.html !== undefined) return { source: { kind: "html", html: input.html } };
  if (s.kind === "entity" && s.entity === "note" && input.text !== undefined) {
    // Text for a note that does not exist yet becomes its content; a real
    // note's text changes through the notes surface (`note_content`).
    const seeded = noteSeedEdit(s, input.text);
    if (seeded) return { source: seeded };
    return {
      ok: false,
      error: `"${tile.title}" is a real note in Notes. Change its text through the note itself: make the tile live (board_focus) and use its note_content write target.`,
    };
  }
  return {
    ok: false,
    error: `"${tile.title}" shows a ${itemTypeFor(s)?.label.toLowerCase() ?? "record"} that lives outside this board, so its content changes where it lives, not from here. Add a write-up (markdown) or a note beside it instead.`,
  };
}
