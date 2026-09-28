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
 *   the Note / Text tools             → a note or a label where you click;
 *   drop                              → files upload; links and text land;
 *   paste                             → links become pages, text a Note;
 *   agents                            → the board_* tools (SpatialBoardSurface).
 *
 * The host owns nothing but placement and the document: every change is
 * reported through `onChange` as a `BoardDocument` (the saved form).
 */

import { type ComponentType, type DragEvent, useEffect, useRef, useState } from "react";
import { ExternalLink, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Camera, type Rect, screenToWorld } from "../engine/camera";
import { useEditingTile, useFocusedTile, useSelectedTile } from "../engine/react";
import { SurfaceActivity, createSurfaceCapture } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SpatialStore } from "../engine/spatial-store";
import type { ThrowAction, ThrowDirection } from "../engine/throw";
import { DEFAULT_THROW_ACTIONS } from "../engine/throw";
import { useBoard } from "../board/useBoard";
import { useBoardKeys } from "../board/useBoardKeys";
import { useWheelModePreference } from "../board/useWheelModePreference";
import type { BoardDocument, NodeSource } from "../board/document";
import { SpatialBoardMenu } from "../components/SpatialBoardMenu";
import { SpatialBoardSurface } from "../components/SpatialBoardSurface";
import { SpatialViewport } from "../components/SpatialViewport";
import { SpatialTile } from "../components/SpatialTile";
import { SpatialFrame } from "../components/SpatialFrame";
import { SpatialEdge } from "../components/SpatialEdge";
import { ShapesLayer } from "../components/ShapesLayer";
import { CreationLayer, type Creation } from "../components/CreationLayer";
import { ToolBar } from "../components/ToolBar";
import { ZoomMenu } from "../components/ZoomMenu";
import { LayersPanel } from "../components/LayersPanel";
import { ParkedShelf } from "../components/ParkedShelf";
import { Minimap, ZoomHud } from "../components/SpatialChrome";
import type { AddTileInput, BoardToolHost, EditTileInput } from "../tools/useBoardAgentTools";
import { createItemSurfaceIndex, type ItemSurfaceIndex } from "../tools/item-surfaces";
import { BOARD_ITEM_TYPES, itemTypeFor } from "../items/catalog";
import type { BoardItemType, PickerProps, PlacedItem, StartNewEntry } from "../items/types";
import { filesToBoardItems } from "../items/file-drop";
import { noteSeedEdit } from "../items/work-sources";
import { intakeText } from "./board-intake";
import { AddMenu, StartPanel } from "./AddMenu";
import { UnavailableItemBody } from "./UnavailableItemBody";

export interface UserBoardTile {
  id: string;
  rect: Rect;
  title: string;
  source: NodeSource;
}

/** Down only takes a tile off this board — what it shows lives on. */
const BOARD_THROWS: Record<ThrowDirection, ThrowAction> = { ...DEFAULT_THROW_ACTIONS, up: "none", down: "remove" };
const CAMERA_SAVE_MS = 1200;

export function UserBoard({
  title,
  doc,
  onChange,
}: {
  title: string;
  /** The saved board this session starts from. */
  doc: BoardDocument;
  /** Every change, as the saved form. */
  onChange: (doc: BoardDocument) => void;
}) {
  const board = useBoard<UserBoardTile>(() => ({
    tiles: doc.nodes.map((n) => ({ id: n.id, rect: n.rect, title: n.title, source: n.source })),
    parked: doc.nodes.filter((n) => n.parked).map((n) => n.id),
    frames: doc.groups,
    shapes: doc.shapes,
    connections: doc.edges,
  }));
  const [store, setStore] = useState<SpatialStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();
  const [layersOpen, setLayersOpen] = useState(false);
  // Every tile's own surface capture, live or dormant: how an agent reaches
  // any item on the board (board_items, board_open_item, board_item_act).
  const [itemSurfaces] = useState(createItemSurfaceIndex);
  // The open picker: a bring-in, or a start-new that needs one choice first.
  const [picking, setPicking] = useState<{ title: string; Picker: ComponentType<PickerProps> } | null>(null);
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
      })),
      groups: now.frames,
      edges: now.connections,
      shapes: board.shapes,
    };
  };
  const cameraNow = () => store?.getCamera() ?? doc.camera;
  const serialized = JSON.stringify([board.tiles, board.parked, board.frames, board.shapes, board.connections]);
  const reported = useRef(serialized);
  useEffect(() => {
    if (reported.current === serialized) return;
    reported.current = serialized;
    onChange(toDoc(cameraNow()));
    // toDoc/cameraNow read live state; the serialized content is the trigger.
  });

  const onChangeRef = useRef(onChange);
  const toDocRef = useRef(toDoc);
  useEffect(() => {
    onChangeRef.current = onChange;
    toDocRef.current = toDoc;
  });

  // The camera is saved once it settles (the URL hash follows it live).
  useEffect(() => {
    if (!store) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = store.getCamera();
    const unsub = store.subscribeFrame(() => {
      const cam = store.getCamera();
      if (cam.x === last.x && cam.y === last.y && cam.z === last.z) return;
      last = cam;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(toDocRef.current(store.getCamera())), CAMERA_SAVE_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [store]);

  // ── placing things — the ONE path every way in ends in ───────────────────
  const viewCentre = () => {
    if (!store) return { x: 0, y: 0 };
    const { w, h } = store.getSize();
    return screenToWorld(store.getCamera(), w / 2, h / 2);
  };

  const place = (items: PlacedItem[], near = viewCentre()) => {
    let lastId: string | null = null;
    for (const item of items) {
      const type = itemTypeFor(item.source);
      const size = item.size ?? type?.defaultSize ?? { w: 480, h: 360 };
      const id = `${type?.key ?? "item"}:${crypto.randomUUID().slice(0, 8)}`;
      board.addTile({ id, title: item.title, source: item.source, rect: { x: 0, y: 0, ...size } }, near);
      lastId = id;
    }
    if (!lastId || !store) return;
    const target = lastId;
    // The tile registers on its next render: then show it, selected, so the
    // person can start on it at once.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        store.select(target);
        store.fitItem(target, 80);
      }),
    );
  };

  const startNew = (_type: BoardItemType, entry: StartNewEntry) => {
    if ("create" in entry) place([entry.create()]);
    else setPicking({ title: entry.label, Picker: entry.Picker });
  };
  const bringIn = (type: BoardItemType) => {
    if (type.bringIn) setPicking({ title: `Bring in: ${type.bringIn.label}`, Picker: type.bringIn.Picker });
  };

  const onCreate = (c: Creation) => {
    const id = `${c.tool}:${crypto.randomUUID().slice(0, 8)}`;
    switch (c.tool) {
      case "note":
        board.addTile({
          id,
          title: "Note",
          source: { kind: "entity", entity: "note", id: null },
          rect: { x: c.at.x - 280, y: c.at.y - 20, w: 560, h: 620 },
        });
        break;
      case "text":
        board.addTile({
          id,
          title: "Label",
          source: { kind: "label", text: "" },
          rect: { x: c.at.x - 20, y: c.at.y - 20, w: 520, h: 120 },
        });
        break;
      case "frame":
        board.addFrame({ id, rect: c.rect, title: "Frame" });
        break;
      case "rect":
      case "oval":
        board.addShape({ id, kind: c.tool, points: [{ x: c.rect.x, y: c.rect.y }, { x: c.rect.x + c.rect.w, y: c.rect.y + c.rect.h }] });
        break;
      case "arrow":
      case "line":
        board.addShape({ id, kind: c.tool, points: [c.from, c.to] });
        break;
      case "pen":
        board.addShape({ id, kind: "pen", points: c.points });
        break;
    }
    requestAnimationFrame(() => store?.select(id));
  };

  // ── drop and paste ────────────────────────────────────────────────────────
  const worldAt = (clientX: number, clientY: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!store || !box) return viewCentre();
    return screenToWorld(store.getCamera(), clientX - box.left, clientY - box.top);
  };

  const placeFiles = async (files: File[], near: { x: number; y: number }) => {
    const label = files.length === 1 ? `"${files[0].name}"` : `${files.length} files`;
    toast(`Uploading ${label} to your board…`);
    const items = await filesToBoardItems(files);
    if (items.length > 0) place(items, near);
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
      void placeFiles(files, viewCentre());
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
  const tileOf = (id: string) => [...board.tiles, ...board.parked].find((t) => t.id === id);
  const park = (id: string) => {
    const undo = board.parkTile(id);
    toast(`Parked "${tileOf(id)?.title ?? "tile"}"`, { action: { label: "Undo", onClick: undo } });
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
  const onThrow = (id: string, direction: ThrowDirection) => {
    const action = BOARD_THROWS[direction];
    if (action === "park") park(id);
    else if (action === "remove") takeOff(id);
  };
  const deleteSelected = () => {
    const id = store?.getSelected();
    if (!id) return;
    if (board.shapes.some((sh) => sh.id === id)) board.removeShape(id);
    else if (board.frames.some((f) => f.id === id)) board.removeFrame(id);
    else if (tileOf(id)) takeOff(id);
  };
  useBoardKeys({
    undo: board.undo,
    redo: board.redo,
    deleteSelected,
    enabled: () => !store?.getEditing(),
  });

  // ── agents: the board_* tools act through the same paths ─────────────────
  const agentHost: BoardToolHost<UserBoardTile> = {
    board,
    store,
    boardTitle: title,
    itemSurfaces,
    createTile: (id, input, size) => agentTile(id, input, size),
    editTile: (tile, input) => agentEdit(tile, input),
    describe: (tile) => {
      const type = itemTypeFor(tile.source);
      return {
        kind: type?.kindLabel ?? type?.key ?? "item",
        surface: type && "name" in type.surface ? type.surface.name : null,
      };
    },
  };

  const byId = new Map(board.tiles.map((t) => [t.id, t]));
  const empty = board.tiles.length === 0 && board.parked.length === 0;

  return (
    <SpatialBoardSurface host={agentHost}>
      <SpatialBoardMenu
        store={store}
        actions={{ park, remove: takeOff, removeLabel: "Take off this board" }}
        parked={board.parked.map((t) => ({ id: t.id, title: t.title }))}
        onUnpark={unpark}
        wheelMode={wheelMode}
        onWheelMode={setWheelMode}
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
          <SpatialViewport
            initialCamera={doc.camera}
            fitOnMount={false}
            insets={{ top: 72, bottom: 56 }}
            wheelMode={wheelMode}
            onStore={setStore}
            overlay={
              <>
                <CreationLayer onCreate={onCreate} />
                <ToolBar leading={<AddMenu types={BOARD_ITEM_TYPES} onStartNew={startNew} onBringIn={bringIn} />} />
                <div
                  data-spatial-chrome
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
                      layersOpen && "bg-primary/15 text-primary",
                    )}
                  >
                    <PanelRight className="h-4 w-4" />
                  </button>
                  <span className="mx-0.5 h-5 w-px bg-border" />
                  <ZoomMenu history={board} />
                </div>
                {layersOpen && (
                  <LayersPanel
                    frames={board.frames.map((f) => ({ id: f.id, title: f.title, rect: f.rect }))}
                    tiles={board.tiles.map((t) => ({
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
                    onClose={() => setLayersOpen(false)}
                  />
                )}
                <ParkedShelf
                  className={layersOpen ? "right-72 top-16" : "top-16"}
                  parked={board.parked.map((t) => ({
                    id: t.id,
                    title: t.title,
                    icon: itemTypeFor(t.source)?.icon ?? PanelRight,
                  }))}
                  onRestore={unpark}
                />
                {empty && <StartPanel types={BOARD_ITEM_TYPES} onStartNew={startNew} onBringIn={bringIn} />}
                {dropping && (
                  <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5">
                    <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg">
                      Drop to put it on your board
                    </span>
                  </div>
                )}
                <ZoomHud />
                <Minimap />
              </>
            }
          >
            {board.frames.map((f) => (
              <SpatialFrame key={f.id} {...f} />
            ))}
            <ShapesLayer shapes={board.shapes} />
            {board.connections.map((c) => {
              const from = byId.get(c.from);
              const to = byId.get(c.to);
              if (!from || !to) return null;
              return <SpatialEdge key={c.id} from={from.rect} to={to.rect} />;
            })}
            {board.tiles.map((t) => (
              <BoardItemTile
                key={t.id}
                tile={t}
                itemSurfaces={itemSurfaces}
                onMove={board.moveTile}
                onThrow={onThrow}
                onSource={(source, nextTitle) =>
                  board.updateTile(t.id, nextTitle ? { source, title: nextTitle } : { source }, { history: false })
                }
              />
            ))}
          </SpatialViewport>
        </div>
      </SpatialBoardMenu>
      <Dialog open={picking !== null} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{picking?.title ?? "Bring in"}</DialogTitle>
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
    </SpatialBoardSurface>
  );
}

/** One tile: the item type's canonical body, or an honest stand-in. */
function BoardItemTile({
  tile,
  itemSurfaces,
  onMove,
  onThrow,
  onSource,
}: {
  tile: UserBoardTile;
  itemSurfaces: ItemSurfaceIndex;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
  onSource: (source: NodeSource, title?: string) => void;
}) {
  const type = itemTypeFor(tile.source);
  const interacting = useEditingTile() === tile.id;
  // The LIVE tile — selected, worked in or focused — is the only one whose
  // feature surface registers; every other copy stays dormant.
  const selected = useSelectedTile() === tile.id;
  const focused = useFocusedTile() === tile.id;
  const live = interacting || selected || focused;
  // The tile's own copy of its surface, registered live or dormant, so an
  // agent can read and act on it without the person switching to it.
  const [capture] = useState(createSurfaceCapture);
  useEffect(() => itemSurfaces.set(tile.id, capture), [itemSurfaces, tile.id, capture]);
  const Host = type && "name" in type.surface ? type.surface.Host : undefined;
  const href = type?.href?.(tile.source) ?? null;
  return (
    <SpatialTile
      id={tile.id}
      rect={tile.rect}
      title={tile.title}
      subtitle={type?.label ?? "Unavailable"}
      icon={type?.icon}
      onMove={onMove}
      onThrow={onThrow}
      throwActions={BOARD_THROWS}
      actions={
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title="Open in its own page"
            aria-label={`Open ${tile.title} in its own page`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : undefined
      }
    >
      {(tier) =>
        type ? (
          <SurfaceActivity active={live} capture={capture}>
            {Host ? (
              <Host source={tile.source}>
                <type.Body tileId={tile.id} source={tile.source} title={tile.title} tier={tier} interacting={interacting} onSource={onSource} />
              </Host>
            ) : (
              <type.Body tileId={tile.id} source={tile.source} title={tile.title} tier={tier} interacting={interacting} onSource={onSource} />
            )}
          </SurfaceActivity>
        ) : (
          <UnavailableItemBody source={tile.source} />
        )
      }
    </SpatialTile>
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
      return { id, rect, title: input.title ?? "Label", source: { kind: "label", text: input.text ?? input.title ?? "" } };
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
