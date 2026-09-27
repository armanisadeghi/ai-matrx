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

import { useEffect, useState } from "react";
import {
  AudioLines,
  BookOpenCheck,
  Code2,
  FileText,
  Gauge,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Mic,
  RotateCcw,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { WheelMode } from "../engine/wheel-input";
import { useBoard } from "../board/useBoard";
import { SpatialBoardMenu } from "../components/SpatialBoardMenu";
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

export interface DemoKindExample {
  kind: string;
  label: string;
  example: Record<string, unknown>;
}

type TileContent =
  | { type: "stream"; stream: ReplayStream }
  | { type: "html"; src: string }
  | { type: "image"; src: string; waitFor?: ReplayStream }
  | { type: "pending"; message: string };

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
  const tiles = useBoard<TileSpec>(() => board.tiles);
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
            <BoardToolbar
              tileCount={allTiles.length}
              examplesNote={examplesNote}
              stressOn={!!stress}
              onRestart={() => restart(false)}
              onInstant={() => restart(true)}
              onToggleStress={toggleStress}
            />
            <ParkedShelf
              parked={tiles.parked.map((t) => ({ id: t.id, title: t.title, icon: t.icon }))}
              onRestore={unpark}
            />
            <ZoomHud />
            <Minimap />
          </>
        }
      >
        {board.frames.map((f) => (
          <SpatialFrame key={f.id} {...f} />
        ))}
        {stress && <SpatialFrame key={stress.frame.id} {...stress.frame} />}
        {board.pipeline.map(([a, b]) => {
          const from = byId.get(a);
          const to = byId.get(b);
          if (!from || !to) return null;
          return <SpatialEdge key={`${a}->${b}`} from={from.rect} to={to.rect} />;
        })}
        {allTiles.map((t) => (
          <BoardTile key={t.id} spec={t} rect={t.rect} onMove={tiles.moveTile} onThrow={onThrow} />
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
      return "";
  }
}

/** Per-viewer preference: how scrolling behaves on the board. Kept in this
 * browser only (a convenience, not shared state); absent storage = default. */
function useWheelModePreference(): [WheelMode, (m: WheelMode) => void] {
  const [mode, setMode] = useState<WheelMode>(() => {
    try {
      const saved = window.localStorage.getItem(WHEEL_MODE_KEY);
      return saved === "zoom" || saved === "pan" || saved === "auto" ? saved : "auto";
    } catch {
      return "auto";
    }
  });
  const update = (m: WheelMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(WHEEL_MODE_KEY, m);
    } catch {
      // Storage blocked (private window): the choice lasts for this visit.
    }
  };
  return [mode, update];
}

const WHEEL_MODE_KEY = "matrx.spatial.wheelMode";

// ── tiles ────────────────────────────────────────────────────────────────────

function BoardTile({
  spec,
  rect,
  onMove,
  onThrow,
}: {
  spec: TileSpec;
  rect: Rect;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
}) {
  const c = spec.content;
  const selected = useSelectedTile() === spec.id;
  const statusFrom: StatusFrom =
    c.type === "stream"
      ? { kind: "self", source: c.stream }
      : c.type === "image" && c.waitFor
        ? { kind: "upstream", source: c.waitFor }
        : { kind: "static", value: c.type === "pending" ? QUEUED : DONE };

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
        }
      }}
    </SpatialTile>
  );
}

const QUEUED = { status: "queued", progress: null } as const;
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

// ── toolbar ──────────────────────────────────────────────────────────────────

function BoardToolbar({
  tileCount,
  examplesNote,
  stressOn,
  onRestart,
  onInstant,
  onToggleStress,
}: {
  tileCount: number;
  examplesNote: string | null;
  stressOn: boolean;
  onRestart: () => void;
  onInstant: () => void;
  onToggleStress: () => void;
}) {
  return (
    <div data-spatial-chrome className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-md backdrop-blur">
        <div className="px-1">
          <p className="text-sm font-semibold text-foreground">Spatial view</p>
          <p className="text-[11px] text-muted-foreground">
            {tileCount} tiles · every stream is a replay
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Replay all
        </Button>
        <Button size="sm" variant="outline" onClick={onInstant} title="Skip streaming — render every result complete">
          <Zap className="mr-1.5 h-3.5 w-3.5" />
          Show finished
        </Button>
        <Button size="sm" variant={stressOn ? "secondary" : "outline"} onClick={onToggleStress}>
          <Gauge className="mr-1.5 h-3.5 w-3.5" />
          {stressOn ? "Remove 100 streams" : "Add 100 live streams"}
        </Button>
      </div>
      {examplesNote && (
        <p className="max-w-md rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          {examplesNote}
        </p>
      )}
    </div>
  );
}
