"use client";

/**
 * VISUAL mode — tap-to-edit on the rendered diagram (flowchart flagship).
 *
 * No drag-canvas: mermaid auto-layout is the feature for non-technical users.
 * Click a step → floating action card (rename / add connected step / shape /
 * color / delete). Click a connection → label / direction / style / delete.
 * Every action dispatches an adapter op; the diagram re-renders from the new
 * source. A runtime self-check disables affordances gracefully if the SVG
 * shape ever drifts from what svg-id-map expects.
 */

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { MermaidRenderer } from "../MermaidRenderer";
import { FLOW_PALETTE } from "../adapters/flowchart";
import type { MermaidEditorAction, EditorSelection } from "../workbench/useMermaidEditor";
import type { MermaidOp } from "../model/ops";
import type { FlowEdgeStyle, FlowShape, FlowchartDoc, MermaidDoc } from "../model/types";
import type { MermaidRenderOptions } from "../types";
import { applySelection, findHit, injectSelectionStyles, stampSvg } from "./svg-id-map";

const SHAPE_CHOICES: Array<{ shape: FlowShape; label: string; glyph: string }> = [
  { shape: "rect", label: "Box", glyph: "▭" },
  { shape: "rounded", label: "Rounded", glyph: "▢" },
  { shape: "stadium", label: "Pill", glyph: "⬭" },
  { shape: "diamond", label: "Decision", glyph: "◇" },
  { shape: "circle", label: "Circle", glyph: "◯" },
];

const EDGE_STYLES: Array<{ style: FlowEdgeStyle; label: string }> = [
  { style: "arrow", label: "Solid" },
  { style: "dotted", label: "Dotted" },
  { style: "thick", label: "Thick" },
];

interface VisualModePaneProps {
  source: string;
  options: MermaidRenderOptions;
  doc: MermaidDoc | null;
  selection: EditorSelection | null;
  dispatch: React.Dispatch<MermaidEditorAction>;
}

export function VisualModePane({ source, options, doc, selection, dispatch }: VisualModePaneProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interactive, setInteractive] = useState(true);
  // Container bounds (cw/ch) are captured at click time so the popover can be
  // clamped without reading the ref during render.
  const [popoverAt, setPopoverAt] = useState<{ x: number; y: number; cw: number; ch: number } | null>(null);

  const flowDoc = doc?.kind === "flowchart" ? (doc as FlowchartDoc) : null;
  const apply = (op: MermaidOp) => dispatch({ type: "APPLY_OP", op });
  const select = (sel: EditorSelection | null) => dispatch({ type: "SELECT", selection: sel });

  const handleSvgMounted = (svg: SVGSVGElement | null) => {
    svgRef.current = svg;
    if (!svg || !flowDoc) return;
    const mapped = stampSvg(svg);
    injectSelectionStyles(svg);
    applySelection(svg, selection?.kind === "edge" ? edgePairKey(flowDoc, selection.id) : selection?.id ?? null);
    // Self-check: a doc with nodes but zero mapped DOM nodes means mermaid's
    // SVG shape drifted — disable affordances instead of dead clicks.
    const ok = flowDoc.nodes.length === 0 || mapped > 0;
    setInteractive(ok);
    if (!ok) {
      console.warn(
        "[MermaidVisual] SVG id mapping found 0 nodes — visual editing disabled for this render (mermaid DOM drift?)",
      );
    }
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !flowDoc) return;
    applySelection(
      svg,
      selection?.kind === "edge" ? edgePairKey(flowDoc, selection.id) : selection?.id ?? null,
    );
  }, [selection, flowDoc]);

  const handleClick = (event: React.MouseEvent) => {
    if (!flowDoc || !interactive) return;
    const hit = findHit(event.target);
    if (!hit) {
      select(null);
      setPopoverAt(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const at = rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top, cw: rect.width, ch: rect.height }
      : { x: 0, y: 0, cw: 400, ch: 300 };
    if (hit.kind === "node") {
      const node = flowDoc.nodes.find((n) => n.id === hit.id);
      if (!node) return;
      select({ kind: "node", id: node.id });
      setPopoverAt(at);
    } else {
      const [from, to] = hit.id.split("→");
      const edge = flowDoc.edges.find((e) => e.from === from && e.to === to);
      if (!edge) return;
      select({ kind: "edge", id: edge.id });
      setPopoverAt(at);
    }
  };

  const closePopover = () => {
    setPopoverAt(null);
    select(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!flowDoc) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <MermaidRenderer source={source} options={options} fillHeight />
        </div>
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Tap-to-edit is available for flowcharts. Use Outline or Code mode to edit this diagram.
        </p>
      </div>
    );
  }

  if (flowDoc.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Button
          onClick={() => apply({ type: "addNode", label: "First step" })}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add your first step
        </Button>
      </div>
    );
  }

  const selectedNode =
    selection?.kind === "node" ? flowDoc.nodes.find((n) => n.id === selection.id) : null;
  const selectedEdge =
    selection?.kind === "edge" ? flowDoc.edges.find((e) => e.id === selection.id) : null;

  const actionCard =
    popoverAt && (selectedNode || selectedEdge) ? (
      selectedNode ? (
        <NodeActions
          key={selectedNode.id}
          label={selectedNode.label}
          shape={selectedNode.shape}
          paletteKey={selectedNode.paletteKey}
          onRename={(label) => apply({ type: "renameNode", id: selectedNode.id, label })}
          onAddConnected={() => {
            apply({ type: "addNode", label: "New step", connectFrom: selectedNode.id });
            closePopover();
          }}
          onShape={(shape) => apply({ type: "setNodeShape", id: selectedNode.id, shape })}
          onPalette={(key) => apply({ type: "setNodePalette", id: selectedNode.id, paletteKey: key })}
          onDelete={() => {
            apply({ type: "deleteNode", id: selectedNode.id });
            closePopover();
          }}
          onClose={closePopover}
        />
      ) : selectedEdge ? (
        <EdgeActions
          key={selectedEdge.id}
          label={selectedEdge.label ?? ""}
          style={selectedEdge.style}
          onLabel={(label) => apply({ type: "setEdgeLabel", id: selectedEdge.id, label })}
          onReverse={() => apply({ type: "reverseEdge", id: selectedEdge.id })}
          onStyle={(style) => apply({ type: "setEdgeStyle", id: selectedEdge.id, style })}
          onDelete={() => {
            apply({ type: "deleteEdge", id: selectedEdge.id });
            closePopover();
          }}
          onClose={closePopover}
        />
      ) : null
    ) : null;

  return (
    <div ref={containerRef} className="relative flex h-full flex-col">
      <div className="min-h-0 flex-1" onClick={handleClick}>
        <MermaidRenderer
          source={source}
          options={options}
          fillHeight
          onSvgMounted={handleSvgMounted}
          hideViewportControls={Boolean(popoverAt)}
        />
      </div>

      {!interactive && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Visual editing is unavailable for this render — use Outline or Code mode.
        </p>
      )}

      {/* Floating add button for unconnected steps */}
      <button
        type="button"
        aria-label="Add step"
        onClick={() => apply({ type: "addNode", label: "New step" })}
        className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105"
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* Action card: floating near the click on desktop, bottom sheet on mobile */}
      {actionCard &&
        (isMobile ? (
          <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-lg border border-border bg-card p-3 shadow-lg pb-safe">
            {actionCard}
          </div>
        ) : (
          <div
            className="absolute z-20 w-64 rounded-lg border border-border bg-card p-3 shadow-lg"
            style={{
              left: Math.min(popoverAt!.x, popoverAt!.cw - 270),
              top: Math.min(popoverAt!.y + 8, popoverAt!.ch - 240),
            }}
          >
            {actionCard}
          </div>
        ))}
    </div>
  );
}

function edgePairKey(doc: FlowchartDoc, edgeId: string): string | null {
  const edge = doc.edges.find((e) => e.id === edgeId);
  return edge ? `${edge.from}→${edge.to}` : null;
}

// ─── Action cards ───────────────────────────────────────────────────────────

function NodeActions(props: {
  label: string;
  shape: FlowShape;
  paletteKey?: string;
  onRename: (label: string) => void;
  onAddConnected: () => void;
  onShape: (shape: FlowShape) => void;
  onPalette: (key: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(props.label);
  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== props.label) props.onRename(trimmed);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitRename();
              props.onClose();
            }
          }}
          autoFocus
          className="h-8 text-base sm:text-sm"
          aria-label="Step name"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Button size="sm" variant="outline" className="w-full justify-start gap-1.5" onClick={props.onAddConnected}>
        <Plus className="h-3.5 w-3.5" />
        Add connected step
      </Button>

      <div className="flex items-center gap-1">
        {SHAPE_CHOICES.map((choice) => (
          <button
            key={choice.shape}
            type="button"
            title={choice.label}
            aria-label={choice.label}
            onClick={() => props.onShape(choice.shape)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded border text-sm",
              props.shape === choice.shape
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {choice.glyph}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {Object.entries(FLOW_PALETTE).map(([key, palette]) => (
          <button
            key={key}
            type="button"
            title={palette.label}
            aria-label={`Color ${palette.label}`}
            onClick={() => props.onPalette(props.paletteKey === key ? null : key)}
            className={cn(
              "h-6 w-6 rounded-full border-2",
              props.paletteKey === key ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: palette.swatch }}
          >
            {props.paletteKey === key && <Check className="mx-auto h-3 w-3 text-white" />}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="w-full justify-start gap-1.5 text-destructive hover:text-destructive"
        onClick={props.onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete step
      </Button>
    </div>
  );
}

function EdgeActions(props: {
  label: string;
  style: FlowEdgeStyle;
  onLabel: (label: string) => void;
  onReverse: () => void;
  onStyle: (style: FlowEdgeStyle) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(props.label);
  const commit = () => {
    if (draft.trim() !== props.label) props.onLabel(draft.trim());
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              props.onClose();
            }
          }}
          placeholder="Connection label"
          autoFocus
          className="h-8 text-base sm:text-sm"
          aria-label="Connection label"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {EDGE_STYLES.map((choice) => (
          <button
            key={choice.style}
            type="button"
            onClick={() => props.onStyle(choice.style)}
            className={cn(
              "flex-1 rounded border px-2 py-1.5 text-xs",
              props.style === choice.style
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>

      <Button size="sm" variant="outline" className="w-full justify-start gap-1.5" onClick={props.onReverse}>
        <ArrowLeftRight className="h-3.5 w-3.5" />
        Reverse direction
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="w-full justify-start gap-1.5 text-destructive hover:text-destructive"
        onClick={props.onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete connection
      </Button>
    </div>
  );
}
