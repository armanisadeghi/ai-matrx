"use client";

// features/esign/editor/components/DocumentStage.tsx — the real PDF with the field layer on it.
//
// Every document stacks in ONE continuous scroll (the platform's PdfPreview, `layout="continuous"`),
// each page carrying its own overlay. Fields are fractions of the page (top-left origin), so zoom
// never changes them. Place by dragging a kind from the palette, or click a kind then click the
// page (the only way on a phone); move and resize by pointer (1 % snap, edge guides); marquee and
// shift-click select several. Detected candidates are drawn dashed until accepted or removed.

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, Minus, Plus, Trash2, X } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { cn } from "@/lib/utils";

import type { DraftField, DraftRecipient, EnvelopeDraftV1 } from "../../contract/draft";
import type { FieldKindV2 } from "../../contract/fieldModel";
import { PAPER, recipientColor } from "../../contract/paper";
import { clampBox, kindSpec } from "../model";
import type { DetectCandidate } from "../api/types";

const PdfPreview = dynamic(() => import("@/features/pdf/components/viewer/PdfPreview"), {
  ssr: false,
  loading: () => <Spinner size="sm" className="m-auto text-muted-foreground" />,
});

export const PALETTE_DRAG = "application/x-matrx-esign-kind";
const SNAP = 0.01;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

type Box = { x: number; y: number; w: number; h: number };

export interface StageHandlers {
  onSelect(ids: string[], additive: boolean): void;
  onPlace(kind: FieldKindV2, documentKey: string, page: number, cx: number, cy: number): void;
  onMoveMany(moves: { id: string; x: number; y: number }[]): void;
  onResize(id: string, box: Box): void;
  onDuplicate(): void;
  onDelete(): void;
  onAcceptCandidate(c: DetectCandidate, documentKey: string): void;
  onRemoveCandidate(candidateId: string): void;
  onPages(documentKey: string, pages: number): void;
}

interface Props extends StageHandlers {
  draft: EnvelopeDraftV1;
  selection: ReadonlySet<string>;
  armed: FieldKindV2 | null;
  candidates: Record<string, DetectCandidate[]>;
  /** Preview as a recipient: only this recipient's fields, nothing editable. */
  onlyRecipient?: string | null;
  readOnly?: boolean;
  zoom: number;
  onZoom(z: number): void;
}

export function DocumentStage(props: Props) {
  const { draft, zoom, onZoom, readOnly } = props;
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-muted/40">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border bg-background/80 px-2 py-1">
        <Button variant="quiet" aria-label="Zoom out" icon={<Minus />} disabled={zoom <= 0.5} onClick={() => onZoom(Math.max(0.5, +(zoom - 0.1).toFixed(2)))} />
        <span className="w-10 text-center type-secondary tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button variant="quiet" aria-label="Zoom in" icon={<Plus />} disabled={zoom >= 2} onClick={() => onZoom(Math.min(2, +(zoom + 0.1).toFixed(2)))} />
      </div>
      <div data-matrx-page-scroll className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex flex-col gap-6 px-2 py-4 sm:px-4" style={{ width: `${Math.max(100, zoom * 100)}%`, maxWidth: zoom <= 1 ? 900 : undefined }}>
          {draft.documents.map((doc) => (
            <section key={doc.key} aria-label={doc.name} className="flex flex-col gap-1.5">
              <h3 className="truncate type-secondary text-muted-foreground">{doc.name}</h3>
              <div className="overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-black/10">
                <PdfPreview
                  fileId={doc.file_id}
                  layout="continuous"
                  onDocumentLoad={(n) => props.onPages(doc.key, n)}
                  renderOverlay={({ pageNumber, rotation }) =>
                    rotation === 0 ? <PageLayer {...props} documentKey={doc.key} page={pageNumber} readOnly={!!readOnly} /> : null
                  }
                />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

interface LayerProps extends Props {
  documentKey: string;
  page: number;
  readOnly: boolean;
}

function PageLayer(p: LayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const fields = p.draft.fields.filter(
    (f) => f.document_key === p.documentKey && f.page === p.page && (!p.onlyRecipient || f.recipient_key === p.onlyRecipient),
  );
  const candidates = (p.candidates[p.documentKey] ?? []).filter((c) => c.page === p.page);

  function fraction(clientX: number, clientY: number) {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }

  return (
    <div
      ref={layerRef}
      data-esign-layer
      className={cn("absolute inset-0 z-[5]", p.armed && !p.readOnly && "cursor-crosshair")}
      style={{ touchAction: p.armed ? "none" : "pan-y" }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget || p.readOnly) return;
        const at = fraction(e.clientX, e.clientY);
        if (!at) return;
        if (p.armed) {
          p.onPlace(p.armed, p.documentKey, p.page, at.x, at.y);
          return;
        }
        if (!e.shiftKey) p.onSelect([], false);
        if (e.pointerType === "mouse") {
          e.currentTarget.setPointerCapture(e.pointerId);
          setMarquee({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
        }
      }}
      onPointerMove={(e) => {
        if (!marquee) return;
        const at = fraction(e.clientX, e.clientY);
        if (at) setMarquee({ ...marquee, x1: at.x, y1: at.y });
      }}
      onPointerUp={(e) => {
        if (!marquee) return;
        const l = Math.min(marquee.x0, marquee.x1);
        const r = Math.max(marquee.x0, marquee.x1);
        const t = Math.min(marquee.y0, marquee.y1);
        const b = Math.max(marquee.y0, marquee.y1);
        if (r - l > 0.005 || b - t > 0.005) {
          const hit = fields.filter((f) => f.x < r && f.x + f.w > l && f.y < b && f.y + f.h > t).map((f) => f.id);
          p.onSelect(hit, e.shiftKey);
        }
        setMarquee(null);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDragOver={(e) => {
        if (!p.readOnly && e.dataTransfer.types.includes(PALETTE_DRAG)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData(PALETTE_DRAG) as FieldKindV2;
        if (!kind || p.readOnly) return;
        e.preventDefault();
        const at = fraction(e.clientX, e.clientY);
        if (at) p.onPlace(kind, p.documentKey, p.page, at.x, at.y);
      }}
    >
      {fields.map((f) => (
        <FieldBox
          key={f.id}
          field={f}
          recipient={p.draft.recipients.find((r) => r.key === f.recipient_key) ?? null}
          selected={p.selection.has(f.id)}
          single={p.selection.size === 1}
          readOnly={p.readOnly}
          layerRef={layerRef}
          siblings={fields}
          selection={p.selection}
          onSelect={p.onSelect}
          onMoveMany={p.onMoveMany}
          onResize={p.onResize}
          onDuplicate={p.onDuplicate}
          onDelete={p.onDelete}
          setGuides={setGuides}
        />
      ))}
      {candidates.map((c) => (
        <div
          key={c.candidate_id}
          className="absolute flex items-center justify-between gap-1 rounded-sm border-2 border-dashed px-1"
          style={{
            left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%`,
            borderColor: PAPER.rule, background: "rgba(250,204,21,0.18)", color: PAPER.ink,
          }}
        >
          {/* A small box has no room beside its two buttons: the label rides on a chip above it. */}
          <span
            className={c.w < 0.18
              ? "absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded-sm px-1 py-0.5 type-meta leading-none"
              : "min-w-0 truncate type-meta leading-none"}
            style={c.w < 0.18 ? { background: "rgba(250,204,21,0.9)", color: PAPER.ink } : undefined}
          >
            {c.label}
          </span>
          <span className="flex shrink-0 gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" aria-label={`Accept ${c.label}`} onClick={() => p.onAcceptCandidate(c, p.documentKey)} className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/15">
              <Check className="h-3 w-3 text-emerald-600" />
            </button>
            <button type="button" aria-label={`Remove ${c.label}`} onClick={() => p.onRemoveCandidate(c.candidate_id)} className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/15">
              <X className="h-3 w-3 text-neutral-700" />
            </button>
          </span>
        </div>
      ))}
      {guides.x !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-500" style={{ left: `${guides.x * 100}%` }} />}
      {guides.y !== null && <div className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-500" style={{ top: `${guides.y * 100}%` }} />}
      {marquee && (
        <div
          className="pointer-events-none absolute border border-sky-500 bg-sky-500/10"
          style={{
            left: `${Math.min(marquee.x0, marquee.x1) * 100}%`, top: `${Math.min(marquee.y0, marquee.y1) * 100}%`,
            width: `${Math.abs(marquee.x1 - marquee.x0) * 100}%`, height: `${Math.abs(marquee.y1 - marquee.y0) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

interface BoxProps {
  field: DraftField;
  recipient: DraftRecipient | null;
  selected: boolean;
  single: boolean;
  readOnly: boolean;
  layerRef: React.RefObject<HTMLDivElement | null>;
  siblings: DraftField[];
  selection: ReadonlySet<string>;
  onSelect: StageHandlers["onSelect"];
  onMoveMany: StageHandlers["onMoveMany"];
  onResize: StageHandlers["onResize"];
  onDuplicate(): void;
  onDelete(): void;
  setGuides(g: { x: number | null; y: number | null }): void;
}

type Drag =
  | { mode: "move"; sx: number; sy: number; w: number; h: number; origin: Map<string, Box> }
  | { mode: "resize"; corner: "nw" | "ne" | "sw" | "se"; sx: number; sy: number; w: number; h: number; box: Box };

function FieldBox(p: BoxProps) {
  const { field: f } = p;
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const spec = kindSpec(f.kind);
  const Icon = spec.icon;
  const color = p.recipient ? recipientColor(p.recipient.color_index) : PAPER.rule;
  const fill = p.recipient ? recipientColor(p.recipient.color_index, 0.18) : "rgba(156,163,175,0.18)";

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const stop = (e: TouchEvent) => e.stopPropagation();
    el.addEventListener("touchstart", stop, { passive: true });
    return () => el.removeEventListener("touchstart", stop);
  }, []);

  function begin(mode: "move" | "resize", e: React.PointerEvent, corner?: "nw" | "ne" | "sw" | "se") {
    if (p.readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (mode === "move" && !(p.selected && !additive)) p.onSelect([f.id], additive);
    const rect = p.layerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const base = { sx: e.clientX, sy: e.clientY, w: rect.width, h: rect.height };
    if (mode === "move") {
      const ids = p.selected && !additive ? p.selection : new Set([f.id]);
      const origin = new Map<string, Box>();
      for (const s of p.siblings) if (ids.has(s.id)) origin.set(s.id, { x: s.x, y: s.y, w: s.w, h: s.h });
      drag.current = { mode, ...base, origin };
    } else {
      drag.current = { mode, corner: corner ?? "se", ...base, box: { x: f.x, y: f.y, w: f.w, h: f.h } };
    }
    ref.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.w;
    const dy = (e.clientY - d.sy) / d.h;
    if (d.mode === "move") {
      const mine = d.origin.get(f.id);
      if (!mine) return;
      let nx = snap(mine.x + dx);
      let ny = snap(mine.y + dy);
      // Edge guides to the other fields on the page.
      let gx: number | null = null;
      let gy: number | null = null;
      for (const s of p.siblings) {
        if (d.origin.has(s.id)) continue;
        for (const edge of [s.x, s.x + s.w, s.x + s.w / 2]) {
          for (const mineEdge of [0, mine.w, mine.w / 2]) {
            if (Math.abs(nx + mineEdge - edge) < 0.006) { nx = edge - mineEdge; gx = edge; }
          }
        }
        for (const edge of [s.y, s.y + s.h, s.y + s.h / 2]) {
          for (const mineEdge of [0, mine.h, mine.h / 2]) {
            if (Math.abs(ny + mineEdge - edge) < 0.006) { ny = edge - mineEdge; gy = edge; }
          }
        }
      }
      p.setGuides({ x: gx, y: gy });
      const ddx = nx - mine.x;
      const ddy = ny - mine.y;
      p.onMoveMany(
        [...d.origin.entries()].map(([id, b]) => {
          const c = clampBox({ ...b, x: b.x + ddx, y: b.y + ddy });
          return { id, x: c.x, y: c.y };
        }),
      );
    } else {
      const b = d.box;
      let { x, y, w, h } = b;
      if (d.corner.includes("e")) w = snap(b.w + dx);
      if (d.corner.includes("s")) h = snap(b.h + dy);
      if (d.corner.includes("w")) { x = snap(b.x + dx); w = b.x + b.w - x; }
      if (d.corner.includes("n")) { y = snap(b.y + dy); h = b.y + b.h - y; }
      p.onResize(f.id, clampBox({ x, y, w, h }));
    }
  }

  function end(e: React.PointerEvent) {
    if (!drag.current) return;
    drag.current = null;
    p.setGuides({ x: null, y: null });
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
  }

  const content =
    f.kind === "checkbox" ? (
      <span className="h-3 w-3 shrink-0 rounded-[2px] border-2" style={{ borderColor: color }} />
    ) : f.kind === "radio" ? (
      <span className="h-3 w-3 shrink-0 rounded-full border-2" style={{ borderColor: color }} />
    ) : (
      <>
        <Icon className="h-3 w-3 shrink-0" style={{ color }} />
        <span className="min-w-0 truncate">
          {typeof f.prefill === "string" && f.prefill ? f.prefill : f.label || spec.label}
          {f.required && f.kind !== "date_signed" ? " *" : ""}
        </span>
      </>
    );

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${f.label || spec.label}${p.recipient ? ` for ${p.recipient.full_name || p.recipient.email}` : ""}`}
      aria-pressed={p.selected}
      data-clickable
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onFocus={() => !p.selected && p.onSelect([f.id], false)}
      className={cn(
        "absolute flex select-none items-center gap-1 overflow-visible rounded-sm px-1 type-meta leading-none",
        p.selected ? "z-10 border-2 shadow-md" : "border border-dashed",
      )}
      style={{
        left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`,
        borderColor: color, background: fill, color: PAPER.ink, touchAction: "none",
      }}
    >
      {content}
      {p.selected && !p.readOnly && (
        <>
          {p.single && (
            <span className="absolute -top-7 right-0 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" aria-label="Duplicate field" onClick={(e) => { e.stopPropagation(); p.onDuplicate(); }} className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/15">
                <Copy className="h-3 w-3 text-neutral-800" />
              </button>
              <button type="button" aria-label="Delete field" onClick={(e) => { e.stopPropagation(); p.onDelete(); }} className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/15">
                <Trash2 className="h-3 w-3 text-neutral-800" />
              </button>
            </span>
          )}
          {p.single &&
            (["nw", "ne", "sw", "se"] as const).map((c) => (
              <span
                key={c}
                aria-hidden
                onPointerDown={(e) => begin("resize", e, c)}
                className={cn(
                  "absolute h-3 w-3 rounded-sm border-2 bg-white",
                  c === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
                  c === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
                  c === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                  c === "se" && "-bottom-1.5 -right-1.5 cursor-nwse-resize",
                )}
                style={{ borderColor: color }}
              />
            ))}
        </>
      )}
    </div>
  );
}
