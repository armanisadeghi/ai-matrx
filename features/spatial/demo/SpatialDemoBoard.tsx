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

import { useEffect, useState, useSyncExternalStore } from "react";
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
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { buildWireText } from "@/features/content-ir/studio/stream-simulator";
import type { Rect } from "../engine/camera";
import { useSelectedTile } from "../engine/react";
import { SpatialViewport } from "../components/SpatialViewport";
import { SpatialTile, type TileStatus } from "../components/SpatialTile";
import { SpatialFrame } from "../components/SpatialFrame";
import { SpatialEdge } from "../components/SpatialEdge";
import { Minimap, ZoomHud } from "../components/SpatialChrome";
import { ReplayStream, type PacedSource } from "../streams/stream-source";
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
  const [stress, setStress] = useState<ReturnType<typeof buildStress> | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

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

  const restart = (instant: boolean) => {
    if (!instant) board.script.reset();
    startStreams(board.tiles, new Set(instant ? [] : [board.script]), instant);
    if (stress) startStreams(stress.tiles, new Set(), instant);
  };

  const onMove = (id: string, x: number, y: number) =>
    setPositions((prev) => ({ ...prev, [id]: { x, y } }));

  const allTiles = stress ? [...board.tiles, ...stress.tiles] : board.tiles;
  const rectOf = (t: TileSpec): Rect => {
    const p = positions[t.id];
    return p ? { ...t.rect, x: p.x, y: p.y } : t.rect;
  };
  const byId = new Map(allTiles.map((t) => [t.id, t]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SpatialViewport
        overlay={
          <>
            <BoardToolbar
              tileCount={allTiles.length}
              examplesNote={examplesNote}
              stressOn={!!stress}
              onRestart={() => restart(false)}
              onInstant={() => restart(true)}
              onToggleStress={() => setStress((s) => (s ? null : buildStress(board.bottom + 220)))}
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
          return <SpatialEdge key={`${a}->${b}`} from={rectOf(from)} to={rectOf(to)} />;
        })}
        {allTiles.map((t) => (
          <BoardTile key={t.id} spec={t} rect={rectOf(t)} onMove={onMove} />
        ))}
      </SpatialViewport>
    </div>
  );
}

// ── tiles ────────────────────────────────────────────────────────────────────

const PROGRESS_STEPS = 20;

/** Coarse status of a source — phase + progress in 5% steps — so a tile's
 * header re-renders ~20 times per stream, not once per chunk. */
function useSourceStatus(source: PacedSource | null): { status: TileStatus; progress: number | null } {
  const key = useSyncExternalStore(
    (l) => (source ? source.subscribe(l) : () => {}),
    () => {
      if (!source) return "none";
      const s = source.get();
      const p = s.expected ? Math.floor((s.received / s.expected) * PROGRESS_STEPS) : -1;
      return `${s.phase}:${p}`;
    },
    () => "idle:-1",
  );
  if (key === "none") return { status: "complete", progress: null };
  const [phase, p] = key.split(":");
  const status: TileStatus = phase === "idle" ? "queued" : (phase as TileStatus);
  const n = Number(p);
  return { status, progress: n < 0 ? null : n / PROGRESS_STEPS };
}

function BoardTile({
  spec,
  rect,
  onMove,
}: {
  spec: TileSpec;
  rect: Rect;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const c = spec.content;
  const source = c.type === "stream" ? c.stream : c.type === "image" ? (c.waitFor ?? null) : null;
  const live = useSourceStatus(source);
  const selected = useSelectedTile() === spec.id;

  let status: TileStatus = live.status;
  if (c.type === "pending") status = "queued";
  if (c.type === "image" && c.waitFor) status = live.status === "complete" ? "complete" : "queued";

  return (
    <SpatialTile
      id={spec.id}
      rect={rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={spec.icon}
      status={status}
      progress={c.type === "stream" ? live.progress : null}
      onMove={onMove}
    >
      {(tier) => {
        switch (c.type) {
          case "stream":
            return <StreamTileBody source={c.stream} tier={tier} />;
          case "html":
            return <HtmlTileBody src={c.src} title={spec.title} tier={tier} active={selected} />;
          case "image":
            return status === "complete" ? (
              <ImageTileBody src={c.src} alt={spec.title} />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Waiting for the script to finish.</p>
            );
          case "pending":
            return <p className="p-4 text-sm leading-relaxed text-muted-foreground">{c.message}</p>;
        }
      }}
    </SpatialTile>
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
    <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-col gap-2">
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
