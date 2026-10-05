"use client";

// features/esign/envelopes/send/FieldPlacementCanvas.tsx — see the document, place who signs where.
//
// DocuSign / Dropbox Sign's "add fields" step: the document is on screen (the platform's ONE PDF
// renderer, `PdfPreview`, every page reachable from its toolbar), the sender chooses a recipient
// and a box kind, then clicks — or drags the kind — onto the page. A box can be moved, resized
// from its corner, and deleted (its x, or Delete). Every recipient's boxes wear that recipient's
// colour. Coordinates are stored as fractions of the page, so zoom never changes them.

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Calendar, FileText, PenLine, Type, X, type LucideIcon } from "lucide-react";

import { Tabs } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import { PAPER } from "@/features/esign/signing/fieldMap";

import {
  clampBox,
  FIELD_KINDS,
  fieldKindSpec,
  recipientColor,
  type FieldKind,
  type PlacedField,
  type Recipient,
} from "../types";

import { Spinner } from "@/components/ui/loaders/Spinner";
// react-pdf needs the browser; the viewer is the heaviest part of the send page.
const PdfPreview = dynamic(() => import("@/features/pdf/components/viewer/PdfPreview"), {
  ssr: false,
  loading: () => <Spinner size="sm" className="m-auto text-muted-foreground" />,
});

const KIND_ICON: Record<FieldKind, LucideIcon> = {
  signature: PenLine,
  initials: Type,
  date_signed: Calendar,
  full_name: FileText,
};

const DRAG_TYPE = "application/x-matrx-esign-field";

let nextFieldId = 1;

interface DocumentRef {
  fileId: string;
  name: string;
}

interface FieldPlacementCanvasProps {
  documents: DocumentRef[];
  recipients: Recipient[];
  fields: PlacedField[];
  onFieldsChange: (update: (current: PlacedField[]) => PlacedField[]) => void;
  activeRecipientKey: string | null;
  onActiveRecipient: (key: string) => void;
}

export function FieldPlacementCanvas({
  documents,
  recipients,
  fields,
  onFieldsChange,
  activeRecipientKey,
  onActiveRecipient,
}: FieldPlacementCanvasProps) {
  const [docId, setDocId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [armed, setArmed] = useState<FieldKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeDoc = documents.find((d) => d.fileId === docId) ?? documents[0] ?? null;
  const activeIndex = recipients.findIndex((r) => r.key === activeRecipientKey);
  const active = activeIndex >= 0 ? recipients[activeIndex] : null;

  // Delete removes the selected box; Escape puts the armed kind down.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "Escape") {
        setArmed(null);
        setSelectedId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        onFieldsChange((all) => all.filter((f) => f.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onFieldsChange]);

  function place(kind: FieldKind, cx: number, cy: number) {
    if (!activeDoc || !active) return;
    const spec = fieldKindSpec(kind);
    const id = `f${nextFieldId++}`;
    const box = clampBox({ x: cx - spec.w / 2, y: cy - spec.h / 2, w: spec.w, h: spec.h });
    onFieldsChange((all) => [...all, { id, fileId: activeDoc.fileId, recipientKey: active.key, kind, page, ...box }]);
    setSelectedId(id);
    setArmed(null);
  }

  if (!activeDoc) return null;

  const docFieldCount = fields.filter((f) => f.fileId === activeDoc.fileId).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        {documents.length > 1 && (
          <Tabs
            variant="capsule"
            aria-label="Documents"
            value={activeDoc.fileId}
            onValueChange={(v) => {
              setDocId(v);
              setPage(1);
              setSelectedId(null);
            }}
            data={documents.map((d) => ({
              value: d.fileId,
              label: d.name.replace(/\.pdf$/i, ""),
              count: fields.filter((f) => f.fileId === d.fileId).length || null,
            }))}
          />
        )}
        {recipients.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {recipients.map((r, i) => {
              const on = r.key === activeRecipientKey;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onActiveRecipient(r.key)}
                  aria-pressed={on}
                  className={cn(
                    "flex h-7 max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 text-xs",
                    on ? "font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  style={on ? { borderColor: recipientColor(i), background: recipientColor(i, 0.14) } : undefined}
                >
                  {/* An SVG, not a coloured span: the pill guard counts glyphs, and a dot is content. */}
                  <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden>
                    <circle cx="5" cy="5" r="5" fill={recipientColor(i)} />
                  </svg>
                  <span className="truncate">{r.fullName}</span>
                </button>
              );
            })}
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            {FIELD_KINDS.map((k) => {
              const Icon = KIND_ICON[k.kind];
              const on = armed === k.kind;
              return (
                <button
                  key={k.kind}
                  type="button"
                  draggable={!!active}
                  disabled={!active}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, k.kind);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => setArmed(on ? null : k.kind)}
                  aria-pressed={on}
                  title={`Click, then click the page — or drag onto it`}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs disabled:opacity-50",
                    on ? "text-foreground" : "border-border border-dashed text-foreground/90 hover:bg-accent/40",
                  )}
                  style={
                    on && activeIndex >= 0
                      ? { borderColor: recipientColor(activeIndex), background: recipientColor(activeIndex, 0.14) }
                      : undefined
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {k.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="type-secondary text-muted-foreground">Add a signer to place fields</p>
        )}
        {armed && active && (
          <p className="type-secondary text-muted-foreground">
            Click the page to place {fieldKindSpec(armed).label.toLowerCase()} for {active.fullName} · Esc to cancel
          </p>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
        <PdfPreview
          key={activeDoc.fileId}
          fileId={activeDoc.fileId}
          pageNumber={page}
          onPageChange={(p) => {
            setPage(p);
            setSelectedId(null);
          }}
          renderOverlay={({ pageNumber, rotation }) =>
            rotation === 0 ? (
              <FieldLayer
                fields={fields.filter((f) => f.fileId === activeDoc.fileId && f.page === pageNumber)}
                recipients={recipients}
                armed={armed !== null && active !== null}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlace={(x, y) => armed && place(armed, x, y)}
                onDropKind={(kind, x, y) => place(kind, x, y)}
                onChange={(id, box) => onFieldsChange((all) => all.map((f) => (f.id === id ? { ...f, ...box } : f)))}
                onRemove={(id) => {
                  onFieldsChange((all) => all.filter((f) => f.id !== id));
                  setSelectedId(null);
                }}
              />
            ) : null
          }
        />
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 type-secondary text-muted-foreground">
        <span className="truncate">{activeDoc.name}</span>
        <span className="shrink-0 tabular-nums">
          {docFieldCount} {docFieldCount === 1 ? "field" : "fields"}
        </span>
      </div>
    </div>
  );
}

interface FieldLayerProps {
  fields: PlacedField[];
  recipients: Recipient[];
  armed: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPlace: (x: number, y: number) => void;
  onDropKind: (kind: FieldKind, x: number, y: number) => void;
  onChange: (id: string, box: { x: number; y: number; w: number; h: number }) => void;
  onRemove: (id: string) => void;
}

function FieldLayer({ fields, recipients, armed, selectedId, onSelect, onPlace, onDropKind, onChange, onRemove }: FieldLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);

  function fraction(clientX: number, clientY: number) {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }

  return (
    <div
      ref={layerRef}
      className={cn("absolute inset-0 z-[5]", armed && "cursor-crosshair")}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (armed) {
          const at = fraction(e.clientX, e.clientY);
          if (at) onPlace(at.x, at.y);
        } else {
          onSelect(null);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData(DRAG_TYPE) as FieldKind;
        if (!FIELD_KINDS.some((k) => k.kind === kind)) return;
        e.preventDefault();
        const at = fraction(e.clientX, e.clientY);
        if (at) onDropKind(kind, at.x, at.y);
      }}
    >
      {fields.map((f) => {
        const index = recipients.findIndex((r) => r.key === f.recipientKey);
        return (
          <FieldBox
            key={f.id}
            field={f}
            colorIndex={index}
            who={index >= 0 ? recipients[index].fullName : ""}
            selected={f.id === selectedId}
            layerRef={layerRef}
            onSelect={() => onSelect(f.id)}
            onChange={(box) => onChange(f.id, box)}
            onRemove={() => onRemove(f.id)}
          />
        );
      })}
    </div>
  );
}

interface FieldBoxProps {
  field: PlacedField;
  colorIndex: number;
  who: string;
  selected: boolean;
  layerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onChange: (box: { x: number; y: number; w: number; h: number }) => void;
  onRemove: () => void;
}

function FieldBox({ field, colorIndex, who, selected, layerRef, onSelect, onChange, onRemove }: FieldBoxProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    mode: "move" | "resize";
    sx: number;
    sy: number;
    box: { x: number; y: number; w: number; h: number };
    width: number;
    height: number;
  } | null>(null);

  // The viewer flips pages on a horizontal swipe; a finger dragging a box is not a swipe.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const stop = (e: TouchEvent) => e.stopPropagation();
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("touchend", stop, { passive: true });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchend", stop);
    };
  }, []);

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      box: { x: field.x, y: field.y, w: field.w, h: field.h },
      width: rect.width,
      height: rect.height,
    };
    boxRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.width;
    const dy = (e.clientY - d.sy) / d.height;
    if (d.mode === "move") {
      onChange(clampBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }));
    } else {
      onChange(
        clampBox({
          ...d.box,
          w: Math.min(1 - d.box.x, d.box.w + dx),
          h: Math.min(1 - d.box.y, d.box.h + dy),
        }),
      );
    }
  }

  function end(e: React.PointerEvent) {
    if (!drag.current) return;
    drag.current = null;
    if (boxRef.current?.hasPointerCapture(e.pointerId)) boxRef.current.releasePointerCapture(e.pointerId);
  }

  const spec = fieldKindSpec(field.kind);
  const Icon = KIND_ICON[field.kind];
  const color = colorIndex >= 0 ? recipientColor(colorIndex) : PAPER.otherBorder;
  const fill = colorIndex >= 0 ? recipientColor(colorIndex, 0.16) : "transparent";

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      aria-label={`${spec.label} for ${who}`}
      data-clickable
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onFocus={onSelect}
      className={cn(
        "absolute flex select-none items-center gap-1 overflow-visible rounded-sm border px-1 type-meta leading-none",
        selected ? "border-2 shadow-md" : "border-dashed",
      )}
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.w * 100}%`,
        height: `${field.h * 100}%`,
        borderColor: color,
        background: fill,
        // On the page, never a theme token: the paper is white in dark mode too.
        color: PAPER.ink,
        touchAction: "none",
      }}
    >
      <Icon className="h-3 w-3 shrink-0" style={{ color }} />
      <span className="min-w-0 truncate">{field.kind === "initials" ? who.split(/\s+/).map((p) => p[0]).join("").slice(0, 3) : spec.label}</span>
      {selected && (
        <>
          <button
            type="button"
            aria-label={`Delete ${spec.label.toLowerCase()}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm"
            style={{ background: PAPER.paper, borderColor: PAPER.otherBorder, color: PAPER.ink }}
          >
            <X className="h-3 w-3" />
          </button>
          <span
            aria-hidden
            onPointerDown={(e) => begin("resize", e)}
            className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border-2"
            style={{ borderColor: color, background: PAPER.paper }}
          />
        </>
      )}
    </div>
  );
}
