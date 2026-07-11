"use client";

// The TRIGGER set — seven ways to reach a picker, each sized for a different
// host. Every trigger below is fully wired: it owns a selection, opens a real
// picker body on real data, and shows the selection live. Final saves follow
// the lab convention (console + toast — never a demo-illegal write).

import React, { useState } from "react";
import {
  Building2,
  ChevronRight,
  Eraser,
  Layers,
  Plus,
  Search,
  SquareCheckBig,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@/components/icons/TapTargetButton";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  previewWrite,
  summarizeSelection,
  useSharpSelection,
  type PickerData,
  type SelectionApi,
  type SharpSelection,
} from "./engine";
import { QuickPick } from "./QuickPick";
import { CompactTree } from "./CompactTree";
import { MillerColumns } from "./MillerColumns";
import { OrgRail } from "./OrgRail";
import { JumpAssign, type JumpAssignResult } from "./JumpAssign";

/* ── shared footer: count + clear + optional save ─────────────────────── */

export function SelectionFooter({
  sel,
  onSave,
  saveLabel = "Save",
  hint,
}: {
  sel: SelectionApi;
  onSave?: () => void;
  saveLabel?: string;
  hint?: string;
}) {
  return (
    <div className="flex h-9 items-center gap-2 border-t border-border px-2">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {sel.count === 0
          ? (hint ?? "Nothing selected")
          : `${sel.count} bucket${sel.count === 1 ? "" : "s"}`}
      </span>
      <button
        onClick={sel.clear}
        disabled={sel.count === 0}
        className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-40"
      >
        Clear
      </button>
      {onSave && (
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={sel.count === 0}
          onClick={onSave}
        >
          {saveLabel}
        </Button>
      )}
    </div>
  );
}

/* ── T1 — Command chip (active / working context, applies LIVE) ───────── */

export function CommandChipDemo({ data }: { data: PickerData }) {
  const [open, setOpen] = useState(false);
  const sel = useSharpSelection((s: SharpSelection) => {
    // Active mode applies live on every toggle. The real write is Surface A's
    // exclusive right (appContextSlice) — a demo may only log it.
    console.log(
      "[context-lab/sharp] ACTIVE apply (Surface A would write appContextSlice) →",
      s,
    );
  });
  const { names, extra } = summarizeSelection(sel.selection, data);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
            sel.count > 0
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0 font-medium">Context</span>
          {sel.count === 0 ? (
            <span className="text-muted-foreground/70">none</span>
          ) : (
            <span className="min-w-0 truncate">
              {names.join(" · ")}
              {extra > 0 && ` +${extra}`}
            </span>
          )}
          <kbd className="ml-0.5 shrink-0 rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">
            ⌘.
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <QuickPick
          data={data}
          sel={sel}
          autoFocus
          footer={
            <SelectionFooter
              sel={sel}
              hint="Toggles apply live — no Set button"
            />
          }
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── T2 — Palette input (typing IS the trigger; agent-chat buckets) ───── */

export function PaletteInputDemo({ data }: { data: PickerData }) {
  const [open, setOpen] = useState(false);
  const sel = useSharpSelection();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-8 w-full max-w-[340px] items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 text-left text-xs text-muted-foreground hover:bg-muted/60">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {sel.count === 0
              ? "Search or set context…"
              : `${sel.count} context bucket${sel.count === 1 ? "" : "s"} — edit`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <QuickPick
          data={data}
          sel={sel}
          autoFocus
          footer={
            <SelectionFooter
              sel={sel}
              saveLabel="Use for this run"
              onSave={() => {
                previewWrite(
                  "agent-run context buckets",
                  { ...sel.selection },
                  "Context buckets set for the run",
                );
                setOpen(false);
              }}
            />
          }
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── T3 — Tap-target pair (toolbar rails; NO padding around them) ─────── */

export function TapTargetDemo({ data }: { data: PickerData }) {
  const [open, setOpen] = useState(false);
  const sel = useSharpSelection();

  return (
    <div className="flex items-center gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <TapTargetButtonGroup>
          <PopoverTrigger asChild>
            <TapTargetButtonForGroup
              icon={<Layers className="matrx-tap-icon" />}
              label={sel.count > 0 ? String(sel.count) : undefined}
              ariaLabel="Set context"
              tooltip="Set context"
            />
          </PopoverTrigger>
          <TapTargetButtonForGroup
            icon={<Eraser className="matrx-tap-icon" />}
            ariaLabel="Clear context"
            tooltip="Clear context"
            disabled={sel.count === 0}
            onClick={sel.clear}
          />
        </TapTargetButtonGroup>
        <PopoverContent align="start" className="w-[360px] p-0">
          <CompactTree
            data={data}
            sel={sel}
            height={300}
            footer={<SelectionFooter sel={sel} />}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ── T4 — Breadcrumb path (roomy hosts; opens the columns) ────────────── */

export function BreadcrumbDemo({ data }: { data: PickerData }) {
  const [open, setOpen] = useState(false);
  const sel = useSharpSelection();

  const lastScopeId = sel.selection.scopeIds[sel.selection.scopeIds.length - 1];
  const last = data.flatScopes.find((fs) => fs.scope.id === lastScopeId);
  const others = sel.count - (last ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex h-8 max-w-full items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted">
          {last ? (
            <>
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">
                {last.org.name}
              </span>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span
                className={cn("truncate", resolveColor(last.type).fg)}
              >
                {last.type.label_plural}
              </span>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="truncate font-medium">{last.scope.name}</span>
              {others > 0 && (
                <span className="ml-1 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{others}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Set context…</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(680px,92vw)] p-0">
        <MillerColumns
          data={data}
          sel={sel}
          footer={<SelectionFooter sel={sel} />}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── T5 — Chip rail (the trigger IS the summary; fixed height) ────────── */

export function ChipRailDemo({ data }: { data: PickerData }) {
  const [open, setOpen] = useState(false);
  const sel = useSharpSelection();

  const scopeChips = sel.selection.scopeIds
    .map((id) => data.flatScopes.find((fs) => fs.scope.id === id))
    .filter((fs): fs is NonNullable<typeof fs> => Boolean(fs));
  const orgChips = sel.selection.orgIds
    .map((id) => data.orgs.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
  const restCount =
    sel.selection.projectIds.length +
    sel.selection.taskIds.length +
    sel.selection.itemRefs.length;

  return (
    <div className="flex h-9 w-full items-center gap-1.5 overflow-hidden rounded-md border border-border px-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {sel.count === 0 && (
          <span className="pl-1 text-xs text-muted-foreground/70">
            No context — the agent sees nothing extra
          </span>
        )}
        {orgChips.map((o) => (
          <span
            key={o.id}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium"
          >
            {o.name}
            <button aria-label={`Remove ${o.name}`} onClick={() => sel.toggleOrg(o.id)}>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </span>
        ))}
        {scopeChips.map((fs) => {
          const c = resolveColor(fs.type);
          return (
            <span
              key={fs.scope.id}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
                c.fg,
                c.border,
              )}
            >
              {fs.scope.name}
              <button
                aria-label={`Remove ${fs.scope.name}`}
                onClick={() => sel.toggleScope(fs.scope.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {restCount > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            +{restCount} more
          </span>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" />
            Context
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <OrgRail
            data={data}
            sel={sel}
            footer={<SelectionFooter sel={sel} />}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ── T6 — Status dot on list rows (per-entity assignment) ─────────────── */

function AssignRow({
  data,
  title,
}: {
  data: PickerData;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = useSharpSelection();

  return (
    <div className="flex h-8 items-center gap-2 border-b border-border/60 px-2 last:border-b-0">
      <SquareCheckBig className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Context for ${title}`}
            className={cn(
              "flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[10px] font-semibold",
              sel.count > 0
                ? "bg-success/15 text-success"
                : "bg-warning/15 text-warning",
            )}
          >
            {sel.count > 0 ? sel.count : "—"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[320px] p-0">
          <QuickPick
            data={data}
            sel={sel}
            autoFocus
            height={240}
            placeholder={`Tag "${title}"…`}
            footer={
              <SelectionFooter
                sel={sel}
                saveLabel="Save tags"
                onSave={() => {
                  previewWrite(
                    "setEntityScopes (assignment)",
                    { entity: title, ...sel.selection },
                    `Tagged "${title}"`,
                  );
                  setOpen(false);
                }}
              />
            }
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function StatusDotRowsDemo({ data }: { data: PickerData }) {
  const rows = data.tasks.slice(0, 3);
  if (rows.length === 0)
    return (
      <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
        No tasks on your account to demo row-level assignment.
      </div>
    );
  return (
    <div className="w-full max-w-[420px] rounded-md border border-border">
      {rows.map((t) => (
        <AssignRow key={t.id} data={data} title={t.title} />
      ))}
    </div>
  );
}

/* ── T7 — Slot link (single-select, down to a context field) ──────────── */

export function SlotLinkDemo({ data }: { data: PickerData }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<JumpAssignResult | null>(null);
  const entity = data.projects[0]?.name ?? "This item";

  return (
    <div className="flex w-full max-w-[420px] items-center gap-2 rounded-md border border-border px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{entity}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {result
            ? result.item
              ? `Filed as ${result.scope.scope.name} · ${result.item.label}`
              : `Filed under ${result.scope.scope.name}`
            : "Not filed anywhere yet"}
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs">
            {result ? "Re-file…" : "File it…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <JumpAssign
            data={data}
            autoFocus
            onDone={(r) => {
              setResult(r);
              setOpen(false);
              previewWrite(
                r.item
                  ? "ctx_context_item_values (reference)"
                  : "ctx_scope_assignments",
                r.item
                  ? {
                      scope_id: r.scope.scope.id,
                      context_item_id: r.item.id,
                      value_kind: "reference",
                      ref_entity: entity,
                    }
                  : { scope_id: r.scope.scope.id, entity },
                r.item
                  ? `Set as ${r.scope.scope.name}'s ${r.item.label}`
                  : `Filed under ${r.scope.scope.name}`,
              );
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
