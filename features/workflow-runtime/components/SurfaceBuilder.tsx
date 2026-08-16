"use client";

/**
 * SurfaceBuilder — the Phase 2 simple builder over a RunSurfaceConfig.
 *
 * Functional, not drag-and-drop yet: one dense row per readout (title,
 * source summary, position steppers, multi-run / prefer / visibility /
 * empty-state selects, remove), an add-readout row (node or
 * progressRail/static, placed via findFreeSlot), reset-to-auto-layout, and
 * a CAS save through saveSurfaceConfig (conflict = toast + reload, never a
 * silent overwrite). Edits are pure immutable config updates in local state.
 */

import { useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import {
  GRID_COLUMNS,
  type GridPos,
  type MultiRunMode,
  type Readout,
  type ReadoutSource,
  type RunSurfaceConfig,
} from "../surface/config";
import { autoLayoutSurface, findFreeSlot } from "../surface/layout";
import {
  createSurface,
  saveSurfaceConfig,
  type RuntimeSurfaceRow,
} from "../surface/service";
import {
  deriveTriggerPoints,
  type WorkflowDefinitionLike,
} from "../trigger-points";

export interface SurfaceBuilderProps {
  definitionId: string;
  definition: WorkflowDefinitionLike;
  surface: RuntimeSurfaceRow | null;
  onSaved: (row: RuntimeSurfaceRow) => void;
}

function nodeLabel(node: WorkflowDefinitionLike["nodes"][number]): string {
  const label = node.data?.label;
  if (typeof label === "string" && label) return label;
  const specType = node.data?.spec_type;
  if (typeof specType === "string" && specType) return `${specType} (${node.id})`;
  return node.id;
}

function sourceSummary(source: ReadoutSource): string {
  switch (source.kind) {
    case "node":
      return `Node: ${source.nodeId}`;
    case "childRun":
      return `Child run: ${source.nodeId}`;
    case "group":
      return `Group: ${source.label} (${source.nodeIds.length} nodes)`;
    case "progressRail":
      return source.nodeIds?.length
        ? `Progress rail (${source.nodeIds.length} nodes)`
        : "Progress rail (all nodes)";
    case "static":
      return "Static content";
    case "action":
      return `Action: ${source.label} → ${source.nodeId}`;
  }
}

const inputClass =
  "rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground";
const selectClass =
  "rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground";
const labelClass = "text-[10px] uppercase tracking-wide text-muted-foreground";

function PosStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, n)));
        }}
        className={`${inputClass} w-14`}
      />
    </label>
  );
}

export function SurfaceBuilder({
  definitionId,
  definition,
  surface,
  onSaved,
}: SurfaceBuilderProps) {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  const [config, setConfig] = useState<RunSurfaceConfig | null>(
    surface ? surface.config : null,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Readout | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [addSource, setAddSource] = useState<string>("");

  const triggerPoints = deriveTriggerPoints(definition);

  const update = (next: RunSurfaceConfig) => {
    setConfig(next);
    setDirty(true);
  };

  const updateReadout = (id: string, patch: Partial<Readout>) => {
    if (!config) return;
    update({
      ...config,
      readouts: config.readouts.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  };

  const updatePos = (id: string, patch: Partial<GridPos>) => {
    if (!config) return;
    const readout = config.readouts.find((r) => r.id === id);
    if (!readout) return;
    const pos: GridPos = { ...readout.pos, ...patch };
    // Keep the box on the 24-column grid after any stepper change.
    pos.w = Math.min(GRID_COLUMNS, Math.max(1, pos.w));
    pos.x = Math.min(GRID_COLUMNS - pos.w, Math.max(0, pos.x));
    pos.y = Math.max(0, pos.y);
    pos.h = Math.max(1, pos.h);
    updateReadout(id, { pos });
  };

  const createDefault = async () => {
    if (!organizationId) {
      toast.error(
        "An organization is required to create a surface. Pick an active organization first.",
      );
      return;
    }
    setBusy(true);
    try {
      const row = await createSurface({
        definitionId,
        organizationId,
        name: "Default",
        isDefault: true,
        config: autoLayoutSurface(definition),
      });
      setConfig(row.config);
      setDirty(false);
      onSaved(row);
      toast.success("Surface created.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Creating the surface failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!surface || !config) return;
    setBusy(true);
    try {
      const outcome = await saveSurfaceConfig({
        id: surface.id,
        expectedVersion: surface.version,
        config,
      });
      if (outcome === "conflict") {
        toast.error(
          "Someone else saved this surface — reload to pick up their changes.",
        );
        return;
      }
      const saved: RuntimeSurfaceRow = {
        ...surface,
        config,
        warnings: [],
        version: surface.version + 1,
      };
      setDirty(false);
      onSaved(saved);
      toast.success("Surface saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Saving the surface failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addReadout = () => {
    if (!config || !addSource) return;
    let source: ReadoutSource;
    if (addSource === "progressRail") {
      source = { kind: "progressRail" };
    } else if (addSource === "static") {
      source = { kind: "static", markdown: "New content" };
    } else {
      source = { kind: "node", nodeId: addSource };
    }
    const items = config.readouts.map((r) => ({ id: r.id, pos: r.pos }));
    const pos = findFreeSlot(items, 12, 8);
    const base = addSource === "progressRail" || addSource === "static"
      ? addSource
      : `node-${addSource}`;
    let id = base;
    let n = 2;
    const taken = new Set(config.readouts.map((r) => r.id));
    while (taken.has(id)) id = `${base}-${n++}`;
    update({ ...config, readouts: [...config.readouts, { id, source, pos }] });
    setAddSource("");
  };

  if (!surface || !config) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3">
        <p className="text-sm text-muted-foreground">
          This workflow has no run surface yet. Create one from the automatic
          layout, then refine it here.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createDefault()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {busy ? "Creating…" : "Create surface"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {surface.name}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {surface.audience} · {surface.profile}
          </span>
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => setResetOpen(true)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> Reset to auto-layout
          </button>
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void save()}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-3 w-3" /> {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {surface.warnings.length > 0 ? (
        <p className="text-xs text-destructive">
          Stored config had problems: {surface.warnings.join(" ")}
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {config.readouts.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <input
              type="text"
              value={r.title ?? ""}
              placeholder={sourceSummary(r.source)}
              onChange={(e) =>
                updateReadout(r.id, {
                  title: e.target.value ? e.target.value : undefined,
                })
              }
              className={`${inputClass} w-40`}
              aria-label="Readout title"
            />
            <span className="text-xs text-muted-foreground">
              {sourceSummary(r.source)}
            </span>
            <span className="flex items-center gap-2">
              <PosStepper label="x" value={r.pos.x} min={0} max={GRID_COLUMNS - 1} onChange={(v) => updatePos(r.id, { x: v })} />
              <PosStepper label="y" value={r.pos.y} min={0} max={10_000} onChange={(v) => updatePos(r.id, { y: v })} />
              <PosStepper label="w" value={r.pos.w} min={1} max={GRID_COLUMNS} onChange={(v) => updatePos(r.id, { w: v })} />
              <PosStepper label="h" value={r.pos.h} min={1} max={1_000} onChange={(v) => updatePos(r.id, { h: v })} />
            </span>
            <label className="flex items-center gap-1">
              <span className={labelClass}>multi-run</span>
              <select
                value={r.multiRun ?? "stack"}
                onChange={(e) =>
                  updateReadout(r.id, { multiRun: e.target.value as MultiRunMode })
                }
                className={selectClass}
              >
                <option value="stack">stack</option>
                <option value="latest">latest</option>
                <option value="table">table</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className={labelClass}>prefer</span>
              <select
                value={r.prefer ?? "live"}
                onChange={(e) =>
                  updateReadout(r.id, {
                    prefer: e.target.value === "persisted" ? "persisted" : "live",
                  })
                }
                className={selectClass}
              >
                <option value="live">live</option>
                <option value="persisted">persisted</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className={labelClass}>appears</span>
              <select
                value={r.visibility?.appearOn ?? ""}
                onChange={(e) => {
                  const vis = { ...r.visibility };
                  if (e.target.value) vis.appearOn = e.target.value;
                  else delete vis.appearOn;
                  updateReadout(r.id, {
                    visibility: Object.keys(vis).length > 0 ? vis : undefined,
                  });
                }}
                className={`${selectClass} max-w-40`}
              >
                <option value="">Always</option>
                {triggerPoints.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className={labelClass}>hides</span>
              <select
                value={r.visibility?.hideOn ?? ""}
                onChange={(e) => {
                  const vis = { ...r.visibility };
                  if (e.target.value) vis.hideOn = e.target.value;
                  else delete vis.hideOn;
                  updateReadout(r.id, {
                    visibility: Object.keys(vis).length > 0 ? vis : undefined,
                  });
                }}
                className={`${selectClass} max-w-40`}
              >
                <option value="">Never</option>
                {triggerPoints.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className={labelClass}>empty</span>
              <select
                value={r.visibility?.empty ?? "placeholder"}
                onChange={(e) => {
                  const vis = { ...r.visibility };
                  if (e.target.value === "hidden") vis.empty = "hidden";
                  else delete vis.empty;
                  updateReadout(r.id, {
                    visibility: Object.keys(vis).length > 0 ? vis : undefined,
                  });
                }}
                className={selectClass}
              >
                <option value="placeholder">placeholder</option>
                <option value="hidden">hidden</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setRemoveTarget(r)}
              className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive"
              aria-label={`Remove readout ${r.title ?? r.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <select
          value={addSource}
          onChange={(e) => setAddSource(e.target.value)}
          className={`${selectClass} min-w-48`}
          aria-label="New readout source"
        >
          <option value="">Add a readout…</option>
          <option value="progressRail">Progress rail</option>
          <option value="static">Static content</option>
          {definition.nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {nodeLabel(node)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!addSource}
          onClick={addReadout}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add readout
        </button>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove this readout?"
        description={
          removeTarget
            ? `"${removeTarget.title ?? sourceSummary(removeTarget.source)}" will be removed from the surface. This takes effect when you save.`
            : undefined
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (removeTarget && config) {
            update({
              ...config,
              readouts: config.readouts.filter((r) => r.id !== removeTarget.id),
            });
          }
          setRemoveTarget(null);
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to the automatic layout?"
        description="Every manual edit on this surface is replaced by the generated default. This takes effect when you save."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={() => {
          update(autoLayoutSurface(definition));
          setResetOpen(false);
        }}
      />
    </div>
  );
}
