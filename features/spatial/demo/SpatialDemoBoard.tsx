"use client";

/**
 * The /demos/spatial proof board: many live results at once on one plane.
 *
 *   Research & study — a research report streaming as prose, beside real
 *     structured kinds (flashcards, quiz, notes, deck…) streaming their
 *     canonical examples through the real accumulator → BlockRenderer.
 *   Podcast pipeline — notes → script → cover art → audio as spatial stages;
 *     each stage starts when the one before it finishes.
 *   Generated HTML — agent-authored pages, sandboxed, inert until selected.
 *   Stress test — optionally 100 more live streams, to prove zoom pacing and
 *     culling hold the frame rate.
 *
 * Every stream here is a REPLAY and every tile says so. Wiring a real run is
 * the `RequestStream` source (features/spatial/streams/stream-source.ts).
 */

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  BookOpenCheck,
  ChevronDown,
  Code2,
  FileText,
  Gauge,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Mic,
  PanelRight,
  RotateCcw,
  StickyNote,
  Type,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { buildWireText } from "@/features/content-ir/studio/stream-simulator";
import type { Rect } from "../engine/camera";
import { useSelectedTile } from "../engine/react";
import type { SpatialStore } from "../engine/spatial-store";
import { DEFAULT_THROW_ACTIONS, type ThrowDirection } from "../engine/throw";
import { useBoard } from "../board/useBoard";
import { SpatialBoardMenu } from "../components/SpatialBoardMenu";
import { CreationLayer, type Creation } from "../components/CreationLayer";
import { ShapesLayer } from "../components/ShapesLayer";
import { ToolBar } from "../components/ToolBar";
import { ZoomMenu } from "../components/ZoomMenu";
import { LayersPanel } from "../components/LayersPanel";
import { NoteTileBody, TextTileBody } from "../tiles/NoteTileBody";
import { ParkedShelf } from "../components/ParkedShelf";
import { SpatialViewport } from "../components/SpatialViewport";
import { SpatialTile } from "../components/SpatialTile";
import { SpatialFrame } from "../components/SpatialFrame";
import { SpatialEdge } from "../components/SpatialEdge";
import { Minimap, ZoomHud } from "../components/SpatialChrome";
import { ReplayStream, type PacedSource } from "../streams/stream-source";
import { type StatusFrom, useTileStatus } from "../streams/useSourceStatus";
import { StreamTileBody } from "../tiles/StreamTileBody";
import { HtmlTileBody, ImageTileBody } from "../tiles/MediaTileBodies";
import {
  FLASHCARD_FALLBACK,
  PODCAST_NOTES,
  PODCAST_SCRIPT,
  QUIZ_FALLBACK,
  RESEARCH_REPORT,
  stressScript,
} from "./demo-content";
import { useWheelModePreference } from "../board/useWheelModePreference";

export interface DemoKindExample {
  kind: string;
  label: string;
  example: Record<string, unknown>;
}

type TileContent =
  | { type: "stream"; stream: ReplayStream }
  | { type: "html"; src: string }
  | { type: "image"; src: string; waitFor?: ReplayStream }
  | { type: "pending"; message: string }
  /** A quick note: a real Note once its first words are typed. */
  | { type: "note"; noteId: string | null }
  /** A text label placed with the Text tool (board-only). */
  | { type: "text"; text: string };

interface TileSpec {
  id: string;
  rect: Rect;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  content: TileContent;
}

interface FrameSpec {
  id: string;
  rect: Rect;
  title: string;
  note: string;
}

const KIND_ICON: Record<string, LucideIcon> = {
  flashcard_set: Layers,
  quiz_set: ListChecks,
  study_notes: BookOpenCheck,
  presentation_deck: FileText,
};

const HTML_SAMPLES = [
  { src: "/samples/ai-matrx-animations.html", title: "Animation study" },
  { src: "/samples/ai-matrx-industries-v2.html", title: "Industries page" },
  { src: "/samples/ai-matrx-vector-variations.html", title: "Vector variations" },
];

const GAP = 40;
const PAD = 48;

function buildBoard(kinds: DemoKindExample[]) {
  const tiles: TileSpec[] = [];
  const frames: FrameSpec[] = [];
  const pipeline: Array<[string, string]> = [];

  // ── Research & study ──────────────────────────────────────────────────────
  const report = { x: PAD, y: PAD, w: 640, h: 1240 };
  tiles.push({
    id: "report",
    rect: report,
    title: "Home battery storage in 2026",
    subtitle: "Research report · replay",
    icon: FileText,
    content: { type: "stream", stream: new ReplayStream("report", RESEARCH_REPORT) },
  });
  const kindW = 720;
  const kindH = 600;
  kinds.forEach((k, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    tiles.push({
      id: `kind:${k.kind}`,
      rect: {
        x: report.x + report.w + GAP + col * (kindW + GAP),
        y: PAD + row * (kindH + GAP),
        w: kindW,
        h: kindH,
      },
      title: k.label,
      subtitle: `${k.kind} · replay`,
      icon: KIND_ICON[k.kind] ?? Layers,
      content: {
        type: "stream",
        stream: new ReplayStream(k.kind, buildWireText(k.example, k.kind, "bare")),
      },
    });
  });
  const kindCols = Math.min(2, kinds.length);
  const kindRows = Math.ceil(kinds.length / 2);
  const studyW = report.w + GAP + kindCols * (kindW + GAP) + PAD * 2 - GAP;
  const studyH = Math.max(report.h, kindRows * (kindH + GAP) - GAP) + PAD * 2;
  frames.push({
    id: "study",
    rect: { x: 0, y: 0, w: studyW, h: studyH },
    title: "Research & study pack",
    note: "Prose and structured kinds streaming side by side",
  });

  // ── Podcast pipeline ──────────────────────────────────────────────────────
  const py = studyH + 220;
  const stageW = 600;
  const notes = new ReplayStream("pod-notes", PODCAST_NOTES);
  const script = new ReplayStream("pod-script", PODCAST_SCRIPT);
  const stages: TileSpec[] = [
    {
      id: "pod:notes",
      rect: { x: PAD, y: py + PAD, w: stageW, h: 720 },
      title: "1 · Episode notes",
      subtitle: "Notes · replay",
      icon: FileText,
      content: { type: "stream", stream: notes },
    },
    {
      id: "pod:script",
      rect: { x: PAD + (stageW + 120), y: py + PAD, w: stageW, h: 720 },
      title: "2 · Script",
      subtitle: "Script · replay",
      icon: Mic,
      content: { type: "stream", stream: script },
    },
    {
      id: "pod:cover",
      rect: { x: PAD + (stageW + 120) * 2, y: py + PAD, w: stageW, h: 400 },
      title: "3 · Cover art",
      subtitle: "Image · stand-in",
      icon: ImageIcon,
      content: { type: "image", src: "/images/ai-cockpit-background.jpg", waitFor: script },
    },
    {
      id: "pod:audio",
      rect: { x: PAD + (stageW + 120) * 2, y: py + PAD + 400 + GAP, w: stageW, h: 280 },
      title: "4 · Episode audio",
      subtitle: "Audio · not in replay",
      icon: AudioLines,
      content: {
        type: "pending",
        message:
          "Audio generation is not part of this replay. In a live pipeline the audio stage streams its progress here and becomes a player when it finishes.",
      },
    },
  ];
  tiles.push(...stages);
  pipeline.push(["pod:notes", "pod:script"], ["pod:script", "pod:cover"], ["pod:cover", "pod:audio"]);
  frames.push({
    id: "podcast",
    rect: { x: 0, y: py, w: PAD * 2 + stageW * 3 + 120 * 2, h: 720 + PAD * 2 },
    title: "Podcast pipeline",
    note: "Each stage starts when the one before it finishes",
  });

  // ── Generated HTML ────────────────────────────────────────────────────────
  const hy = py + 720 + PAD * 2 + 220;
  HTML_SAMPLES.forEach((s, i) => {
    tiles.push({
      id: `html:${i}`,
      rect: { x: PAD + i * (640 + GAP), y: hy + PAD, w: 640, h: 460 },
      title: s.title,
      subtitle: "Generated HTML · sandboxed",
      icon: Code2,
      content: { type: "html", src: s.src },
    });
  });
  frames.push({
    id: "html",
    rect: { x: 0, y: hy, w: PAD * 2 + 3 * 640 + 2 * GAP, h: 460 + PAD * 2 },
    title: "Generated pages",
    note: "Agent-authored HTML, sandboxed — select a page to interact",
  });

  return { tiles, frames, pipeline, notes, script, bottom: hy + 460 + PAD * 2 };
}

function buildStress(top: number): { tiles: TileSpec[]; frame: FrameSpec } {
  const tiles: TileSpec[] = [];
  const w = 380;
  const h = 300;
  for (let i = 0; i < 100; i++) {
    const col = i % 10;
    const row = Math.floor(i / 10);
    tiles.push({
      id: `stress:${i}`,
      rect: { x: PAD + col * (w + 24), y: top + PAD + row * (h + 24), w, h },
      title: `Monitor ${i + 1}`,
      subtitle: "Stress · replay",
      icon: Gauge,
      content: { type: "stream", stream: new ReplayStream(`stress-${i}`, stressScript(i)) },
    });
  }
  return {
    tiles,
    frame: {
      id: "stress",
      rect: { x: 0, y: top, w: PAD * 2 + 10 * w + 9 * 24, h: PAD * 2 + 10 * h + 9 * 24 },
      title: "Stress test — 100 live streams",
      note: "Zoom out: updates batch; pan away: they stop; come back: they catch up",
    },
  };
}

function startStreams(tiles: TileSpec[], skip: Set<ReplayStream>, instant: boolean) {
  let n = 0;
  for (const t of tiles) {
    if (t.content.type !== "stream" || skip.has(t.content.stream)) continue;
    t.content.stream.start({ instant, startDelayMs: (n++ % 12) * 180 });
  }
}

export function SpatialDemoBoard({
  kinds,
  examplesNote,
}: {
  kinds: DemoKindExample[];
  /** Set when the canonical examples could not be read — shown on the board. */
  examplesNote: string | null;
}) {
  const effectiveKinds =
    kinds.length > 0
      ? kinds
      : [
          { kind: "flashcard_set", label: "Flashcards", example: FLASHCARD_FALLBACK },
          { kind: "quiz_set", label: "Quiz", example: QUIZ_FALLBACK },
        ];
  const [board] = useState(() => buildBoard(effectiveKinds));
  const tiles = useBoard<TileSpec>(() => ({ tiles: board.tiles, frames: board.frames }));
  const [layersOpen, setLayersOpen] = useState(false);
  const activeOrgId = useAppSelector(selectOrganizationId);
  const [stress, setStress] = useState<ReturnType<typeof buildStress> | null>(null);
  const [store, setStore] = useState<SpatialStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();

  useEffect(() => {
    void kindRegistry.ensureWarm();
    void componentRegistry.ensureWarm();
  }, []);

  // Start everything; chain the pipeline (script waits for notes).
  useEffect(() => {
    startStreams(board.tiles, new Set([board.script]), false);
    // Chain on the notes' TRANSITION to complete, so a replay re-chains and an
    // instant (already-complete) run does not restart the script.
    let lastPhase = board.notes.get().phase;
    const unsub = board.notes.subscribe(() => {
      const phase = board.notes.get().phase;
      if (phase === "complete" && lastPhase === "streaming") board.script.start({});
      lastPhase = phase;
    });
    return () => {
      unsub();
      for (const t of board.tiles) if (t.content.type === "stream") t.content.stream.stop();
    };
  }, [board]);

  useEffect(() => {
    if (!stress) return;
    startStreams(stress.tiles, new Set(), false);
    return () => {
      for (const t of stress.tiles) if (t.content.type === "stream") t.content.stream.stop();
    };
  }, [stress]);

  const toggleStress = () => {
    if (stress) {
      tiles.dropTiles(stress.tiles.map((t) => t.id));
      setStress(null);
    } else {
      const next = buildStress(board.bottom + 220);
      tiles.addTiles(next.tiles);
      setStress(next);
    }
  };

  const restart = (instant: boolean) => {
    if (!instant) board.script.reset();
    startStreams(board.tiles, new Set(instant ? [] : [board.script]), instant);
    if (stress) startStreams(stress.tiles, new Set(), instant);
  };

  // ── what a throw, a menu item or the shelf does — one path each ──────────
  const specOf = (id: string) => [...tiles.tiles, ...tiles.parked].find((t) => t.id === id);

  const park = (id: string) => {
    const spec = specOf(id);
    const undo = tiles.parkTile(id);
    toast(`Parked "${spec?.title ?? "tile"}"`, { action: { label: "Undo", onClick: undo } });
  };

  const unpark = (id: string) => {
    tiles.unparkTile(id);
    // The tile re-registers on its next render; fly once it is back.
    requestAnimationFrame(() => requestAnimationFrame(() => store?.fitItem(id)));
  };

  const saveAndClose = async (id: string) => {
    const spec = specOf(id);
    if (!spec) return;
    if (spec.content.type === "note" && spec.content.noteId) {
      const undo = tiles.removeTile(id);
      toast.success(`"${spec.title}" is already in Notes (Board notes) — closed it here`, {
        action: { label: "Put back", onClick: undo },
      });
      return;
    }
    const markdown = tileMarkdown(spec);
    if (!markdown.trim()) {
      toast.error(`"${spec.title}" has nothing to save yet — it is still waiting for content.`);
      return;
    }
    try {
      const organizationId = await ensureOrganizationContext({ organizationId: activeOrgId });
      await NotesAPI.create({
        label: spec.title,
        content: markdown,
        folder_name: "Scratch",
        tags: ["board"],
        organization_id: organizationId,
      });
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error(`Could not save "${spec.title}" to Notes: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const undo = tiles.removeTile(id);
    toast.success(`Saved "${spec.title}" to Notes (Scratch) and closed it`, {
      action: { label: "Put back", onClick: undo },
    });
  };

  const remove = async (id: string) => {
    const spec = specOf(id);
    if (!spec) return;
    const ok = await confirm({
      title: `Delete "${spec.title}" from this board?`,
      description:
        spec.content.type === "stream"
          ? "The tile and its live view leave the board, and anything it has not finished streaming is not kept. You can undo right after."
          : "The tile leaves the board. You can undo right after.",
      confirmLabel: "Delete from board",
      variant: "destructive",
    });
    if (!ok) return;
    const undo = tiles.removeTile(id);
    toast(`Deleted "${spec.title}" from the board`, { action: { label: "Undo", onClick: undo } });
  };

  const onThrow = (id: string, direction: ThrowDirection) => {
    const action = DEFAULT_THROW_ACTIONS[direction];
    if (action === "park") park(id);
    else if (action === "save-close") void saveAndClose(id);
    else if (action === "delete") void remove(id);
  };

  // ── the tool bar's creations ────────────────────────────────────────────
  const onCreate = (c: Creation) => {
    const id = `${c.tool}:${crypto.randomUUID().slice(0, 8)}`;
    switch (c.tool) {
      case "note":
        tiles.addTile({
          id,
          title: "Note",
          subtitle: "Quick note",
          icon: StickyNote,
          rect: { x: c.at.x - 180, y: c.at.y - 20, w: 360, h: 280 },
          content: { type: "note", noteId: null },
        });
        break;
      case "text":
        tiles.addTile({
          id,
          title: "Text",
          subtitle: "Label",
          icon: Type,
          rect: { x: c.at.x - 20, y: c.at.y - 20, w: 420, h: 120 },
          content: { type: "text", text: "" },
        });
        break;
      case "frame":
        tiles.addFrame({ id, rect: c.rect, title: "Frame", note: "" });
        break;
      case "rect":
      case "oval":
        tiles.addShape({ id, kind: c.tool, points: [{ x: c.rect.x, y: c.rect.y }, { x: c.rect.x + c.rect.w, y: c.rect.y + c.rect.h }] });
        break;
      case "arrow":
      case "line":
        tiles.addShape({ id, kind: c.tool, points: [c.from, c.to] });
        break;
      case "pen":
        tiles.addShape({ id, kind: "pen", points: c.points });
        break;
    }
    requestAnimationFrame(() => store?.select(id));
  };

  const deleteSelected = () => {
    const id = store?.getSelected();
    if (!id) return;
    if (tiles.shapes.some((sh) => sh.id === id)) tiles.removeShape(id);
    else if (tiles.frames.some((f) => f.id === id)) tiles.removeFrame(id);
    else if (specOf(id)) void remove(id);
    else return;
    toast("Deleted", { action: { label: "Undo", onClick: tiles.undo } });
  };

  useBoardKeys({ undo: tiles.undo, redo: tiles.redo, deleteSelected });

  const allTiles = tiles.tiles;
  const byId = new Map(allTiles.map((t) => [t.id, t]));

  return (
    <SpatialBoardMenu
      store={store}
      actions={{ park, saveAndClose: (id) => void saveAndClose(id), remove: (id) => void remove(id) }}
      parked={tiles.parked.map((t) => ({ id: t.id, title: t.title }))}
      onUnpark={unpark}
      wheelMode={wheelMode}
      onWheelMode={setWheelMode}
    >
      <SpatialViewport
        insets={{ top: 72, bottom: 56 }}
        wheelMode={wheelMode}
        onStore={setStore}
        overlay={
          <>
            <CreationLayer onCreate={onCreate} />
            <ToolBar
              leading={
                <DemoMenu
                  tileCount={allTiles.length}
                  stressOn={!!stress}
                  onRestart={() => restart(false)}
                  onInstant={() => restart(true)}
                  onToggleStress={toggleStress}
                />
              }
            />
            {examplesNote && (
              <p
                data-spatial-chrome
                className="absolute left-4 top-16 z-30 max-w-md rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
              >
                {examplesNote}
              </p>
            )}
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
              <ZoomMenu history={tiles} />
            </div>
            {layersOpen && (
              <LayersPanel
                frames={tiles.frames.map((f) => ({ id: f.id, title: f.title, rect: f.rect }))}
                tiles={allTiles.map((t) => ({ id: t.id, title: t.title, rect: t.rect, icon: t.icon }))}
                shapeCount={tiles.shapes.length}
                onRename={(id, title) => {
                  if (tiles.frames.some((f) => f.id === id)) tiles.updateFrame(id, { title });
                  else tiles.updateTile(id, { title });
                }}
                onClose={() => setLayersOpen(false)}
              />
            )}
            <ParkedShelf
              className={layersOpen ? "right-72 top-16" : "top-16"}
              parked={tiles.parked.map((t) => ({ id: t.id, title: t.title, icon: t.icon }))}
              onRestore={unpark}
            />
            <ZoomHud />
            <Minimap />
          </>
        }
      >
        {tiles.frames.map((f) => (
          <SpatialFrame key={f.id} {...f} />
        ))}
        <ShapesLayer shapes={tiles.shapes} />
        {stress && <SpatialFrame key={stress.frame.id} {...stress.frame} />}
        {board.pipeline.map(([a, b]) => {
          const from = byId.get(a);
          const to = byId.get(b);
          if (!from || !to) return null;
          return <SpatialEdge key={`${a}->${b}`} from={from.rect} to={to.rect} />;
        })}
        {allTiles.map((t) => (
          <BoardTile
            key={t.id}
            spec={t}
            rect={t.rect}
            onMove={tiles.moveTile}
            onThrow={onThrow}
            onContent={(content, title) =>
              tiles.updateTile(t.id, title ? { content, title } : { content }, { history: false })
            }
          />
        ))}
      </SpatialViewport>
    </SpatialBoardMenu>
  );
}

/** The markdown a tile saves as: its stream's text, or a reference to its media. */
function tileMarkdown(spec: TileSpec): string {
  const c = spec.content;
  switch (c.type) {
    case "stream":
      return c.stream
        .get()
        .blocks.map((b) => b.content ?? "")
        .join("\n\n");
    case "html":
      return `# ${spec.title}\n\nGenerated page: ${new URL(c.src, window.location.origin).href}`;
    case "image":
      return `# ${spec.title}\n\n![${spec.title}](${new URL(c.src, window.location.origin).href})`;
    case "pending":
    case "note":
      return "";
    case "text":
      return c.text;
  }
}


// ── tiles ────────────────────────────────────────────────────────────────────

function BoardTile({
  spec,
  rect,
  onMove,
  onThrow,
  onContent,
}: {
  spec: TileSpec;
  rect: Rect;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
  onContent: (content: TileContent, title?: string) => void;
}) {
  const c = spec.content;
  const selected = useSelectedTile() === spec.id;
  const statusFrom: StatusFrom =
    c.type === "stream"
      ? { kind: "self", source: c.stream }
      : c.type === "image" && c.waitFor
        ? { kind: "upstream", source: c.waitFor }
        : { kind: "static", value: c.type === "pending" ? QUEUED : c.type === "note" && !c.noteId ? IDLE : DONE };

  return (
    <SpatialTile
      id={spec.id}
      rect={rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={spec.icon}
      statusFrom={statusFrom}
      onMove={onMove}
      onThrow={onThrow}
    >
      {(tier) => {
        switch (c.type) {
          case "stream":
            return <StreamTileBody source={c.stream} tier={tier} />;
          case "html":
            return <HtmlTileBody src={c.src} title={spec.title} tier={tier} active={selected} />;
          case "image":
            return <GatedImage src={c.src} alt={spec.title} waitFor={c.waitFor ?? null} />;
          case "pending":
            return <p className="p-4 text-sm leading-relaxed text-muted-foreground">{c.message}</p>;
          case "note":
            return (
              <NoteTileBody
                noteId={c.noteId}
                onCreated={(noteId, label) => onContent({ type: "note", noteId }, label)}
              />
            );
          case "text":
            return <TextTileBody text={c.text} onChange={(text) => onContent({ type: "text", text })} />;
        }
      }}
    </SpatialTile>
  );
}

const QUEUED = { status: "queued", progress: null } as const;
const IDLE = { status: "idle", progress: null } as const;
const DONE = { status: "complete", progress: null } as const;

/** An image stage that appears once the stage it waits on has finished. */
function GatedImage({ src, alt, waitFor }: { src: string; alt: string; waitFor: PacedSource | null }) {
  const { status } = useTileStatus(
    waitFor ? { kind: "upstream", source: waitFor } : { kind: "static", value: DONE },
  );
  return status === "complete" ? (
    <ImageTileBody src={src} alt={alt} />
  ) : (
    <p className="p-4 text-sm text-muted-foreground">Waiting for the script to finish.</p>
  );
}

// ── demo menu (the proof's own controls, inside the tool bar) ───────────────

function DemoMenu({
  tileCount,
  stressOn,
  onRestart,
  onInstant,
  onToggleStress,
}: {
  tileCount: number;
  stressOn: boolean;
  onRestart: () => void;
  onInstant: () => void;
  onToggleStress: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-foreground hover:bg-accent"
        >
          Spatial view
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" data-spatial-chrome>
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {`${tileCount} tiles · every stream is a replay`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Replay all
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onInstant}>
          <Zap className="mr-2 h-4 w-4" />
          Show finished
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleStress}>
          <Gauge className="mr-2 h-4 w-4" />
          {stressOn ? "Remove 100 streams" : "Add 100 live streams"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** ⌘Z / ⇧⌘Z (and Ctrl on Windows) and Delete / Backspace on the board. */
function useBoardKeys({
  undo,
  redo,
  deleteSelected,
}: {
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
}) {
  const handlers = useRef({ undo, redo, deleteSelected });
  useEffect(() => {
    handlers.current = { undo, redo, deleteSelected };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handlers.current.redo();
        else handlers.current.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handlers.current.redo();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        handlers.current.deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
