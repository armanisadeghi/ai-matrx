"use client";

/**
 * ResourceEditableToggleSamples — design bake-off for the per-resource
 * "read-only ↔ editable" control that will live on attachment chips.
 *
 * Dev-only. Each variant is a self-contained interactive tile (local state)
 * built on the SAME theme primitives as the production ResourceAttachmentTile,
 * so picking a winner is a 1:1 port into the real tile.
 *
 * Wire semantics this control drives (see selectResourcePayloads):
 *   read-only → `editable` key omitted from the content block (backend default)
 *   editable  → `editable: true` sent
 * Only reference resources that the agent can write back (input_notes,
 * input_task, input_table, input_list, input_data, input_webpage) are
 * editable-capable; files / media / text never show the control.
 */

import { createElement, useState, type ComponentType } from "react";
import {
  StickyNote,
  CheckSquare,
  Lock,
  Pencil,
  X,
  Eye,
  FilePen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveResourceAttachmentTileTheme,
  resourceAttachmentTileAdaptiveSurface,
  RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
} from "./resourceAttachmentTile.theme";

type EditableState = "readonly" | "editable";

interface SampleSpec {
  themeKey: string;
  typeLabel: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

const SAMPLES: SampleSpec[] = [
  {
    themeKey: "input_notes",
    typeLabel: "Note",
    title: "Q3 launch retro",
    icon: StickyNote,
  },
  {
    themeKey: "input_task",
    typeLabel: "Task",
    title: "Ship pricing page",
    icon: CheckSquare,
  },
];

function RemoveX() {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Remove"
      className={cn(
        "absolute top-0.5 right-0.5 z-10 inline-flex items-center justify-center rounded-full",
        "p-0.5 text-muted-foreground/80 hover:bg-black/10 hover:text-foreground",
        "dark:hover:bg-white/10 transition-colors",
      )}
    >
      <X className="h-2.5 w-2.5" />
    </span>
  );
}

function TileHead({ spec }: { spec: SampleSpec }) {
  const theme = resolveResourceAttachmentTileTheme(spec.themeKey);
  return (
    <>
      <span className="flex items-center gap-1 min-w-0 w-full">
        <span className="h-[1.125rem] w-[1.125rem] shrink-0 flex items-center justify-center">
          {createElement(spec.icon, {
            className: cn("h-3.5 w-3.5 shrink-0", theme.icon),
          })}
        </span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[9px] font-semibold leading-none text-muted-foreground uppercase tracking-wide">
          {spec.typeLabel}
        </span>
      </span>
      <span className="block w-full min-w-0 truncate whitespace-nowrap text-[10px] leading-none text-foreground font-medium">
        {spec.title}
      </span>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variant A — corner icon (bottom-right, mirrors the X)
// ─────────────────────────────────────────────────────────────────────────

function VariantACorner({ spec }: { spec: SampleSpec }) {
  const theme = resolveResourceAttachmentTileTheme(spec.themeKey);
  const [state, setState] = useState<EditableState>("readonly");
  const editable = state === "editable";

  return (
    <div className="group relative inline-flex shrink-0">
      <div
        className={cn(
          RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
          "w-[7.5rem] flex flex-col text-left min-w-0 px-1.5 py-1 gap-0.5 pr-4 pb-4",
          resourceAttachmentTileAdaptiveSurface(theme),
          editable && "ring-1 ring-primary/40 dark:ring-primary/40",
        )}
      >
        <TileHead spec={spec} />
      </div>

      <RemoveX />

      <button
        type="button"
        aria-pressed={editable}
        aria-label={
          editable
            ? "Editable — click to lock"
            : "Read-only — click to allow edits"
        }
        title={editable ? "Editable — agent may modify" : "Read-only"}
        onClick={() => setState(editable ? "readonly" : "editable")}
        className={cn(
          "absolute bottom-0.5 right-0.5 z-10 inline-flex items-center justify-center rounded-full p-0.5",
          "transition-colors",
          editable
            ? "text-primary"
            : "text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-foreground",
        )}
      >
        {editable ? (
          <Pencil className="h-2.5 w-2.5" />
        ) : (
          <Lock className="h-2.5 w-2.5" />
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variant B — inline badge under the title
// ─────────────────────────────────────────────────────────────────────────

function VariantBBadge({ spec }: { spec: SampleSpec }) {
  const theme = resolveResourceAttachmentTileTheme(spec.themeKey);
  const [state, setState] = useState<EditableState>("readonly");
  const editable = state === "editable";

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={cn(
          RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
          "w-[7.5rem] flex flex-col text-left min-w-0 px-1.5 py-1 gap-0.5 pr-4",
          resourceAttachmentTileAdaptiveSurface(theme),
        )}
      >
        <TileHead spec={spec} />
        <button
          type="button"
          aria-pressed={editable}
          onClick={() => setState(editable ? "readonly" : "editable")}
          className={cn(
            "mt-0.5 inline-flex items-center gap-0.5 self-start rounded-full px-1 py-px",
            "text-[8px] font-semibold uppercase tracking-wide leading-none transition-colors",
            editable
              ? "bg-primary/15 text-primary"
              : "bg-black/5 text-muted-foreground hover:text-foreground dark:bg-white/10",
          )}
        >
          {editable ? (
            <Pencil className="h-2 w-2" />
          ) : (
            <Lock className="h-2 w-2" />
          )}
          {editable ? "Editable" : "Read-only"}
        </button>
      </div>
      <RemoveX />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variant C — segmented Eye / Pencil control (always visible, bottom row)
// ─────────────────────────────────────────────────────────────────────────

function VariantCSegmented({ spec }: { spec: SampleSpec }) {
  const theme = resolveResourceAttachmentTileTheme(spec.themeKey);
  const [state, setState] = useState<EditableState>("readonly");
  const editable = state === "editable";

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={cn(
          RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
          "w-[7.5rem] flex flex-col text-left min-w-0 px-1.5 py-1 gap-0.5 pr-4",
          resourceAttachmentTileAdaptiveSurface(theme),
        )}
      >
        <TileHead spec={spec} />
        <div className="mt-0.5 inline-flex items-center gap-px self-start rounded-md bg-black/5 p-px dark:bg-white/10">
          <button
            type="button"
            aria-label="Read-only"
            aria-pressed={!editable}
            onClick={() => setState("readonly")}
            className={cn(
              "inline-flex items-center justify-center rounded-[5px] px-1 py-0.5 transition-colors",
              !editable
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            <Eye className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            aria-label="Editable"
            aria-pressed={editable}
            onClick={() => setState("editable")}
            className={cn(
              "inline-flex items-center justify-center rounded-[5px] px-1 py-0.5 transition-colors",
              editable
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            <FilePen className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      <RemoveX />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Variant D — hover-revealed control row (room to grow)
// ─────────────────────────────────────────────────────────────────────────

function VariantDHoverRow({ spec }: { spec: SampleSpec }) {
  const theme = resolveResourceAttachmentTileTheme(spec.themeKey);
  const [state, setState] = useState<EditableState>("readonly");
  const editable = state === "editable";

  return (
    <div className="group relative inline-flex shrink-0">
      <div
        className={cn(
          RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
          "w-[7.5rem] flex flex-col text-left min-w-0 px-1.5 py-1 gap-0.5 pr-4",
          resourceAttachmentTileAdaptiveSurface(theme),
        )}
      >
        <TileHead spec={spec} />
        <div
          className={cn(
            "grid transition-all duration-150 ease-out",
            editable
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 group-hover:grid-rows-[1fr] group-hover:opacity-100",
          )}
        >
          <div className="overflow-hidden">
            <button
              type="button"
              aria-pressed={editable}
              onClick={() => setState(editable ? "readonly" : "editable")}
              className={cn(
                "mt-0.5 flex w-full items-center gap-1 rounded px-1 py-0.5",
                "text-[9px] font-medium leading-none transition-colors",
                editable
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {editable ? (
                <Pencil className="h-2.5 w-2.5" />
              ) : (
                <Lock className="h-2.5 w-2.5" />
              )}
              {editable ? "Agent can edit" : "Allow edits"}
            </button>
          </div>
        </div>
      </div>
      <RemoveX />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function VariantRow({
  label,
  description,
  recommended,
  children,
}: {
  label: string;
  description: string;
  recommended?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        {recommended ? (
          <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
            Likely winner
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="bg-muted border border-border rounded-lg px-2 py-3 max-w-md">
        <div className="flex flex-wrap items-start gap-2">{children}</div>
      </div>
    </section>
  );
}

export function ResourceEditableToggleSamples() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 border-b border-border pb-2">
        <h2 className="text-base font-semibold text-foreground">
          Read-only ↔ Editable toggle (bake-off)
        </h2>
        <p className="text-xs text-muted-foreground">
          Per-resource control for notes / tasks / tables / lists that the agent
          can write back to. Read-only is the default (no{" "}
          <code className="text-[10px]">editable</code> key on the wire);
          toggling on sends <code className="text-[10px]">editable: true</code>.
          Click each tile&apos;s control to see both states. Hover where noted.
        </p>
      </div>

      <VariantRow
        label="A — Corner icon"
        recommended
        description="Tiny lock/pencil in the bottom-right (mirrors the X). Hidden until hover when read-only; persistent + primary-tinted + ring when editable. Zero footprint."
      >
        {SAMPLES.map((s) => (
          <VariantACorner key={s.themeKey} spec={s} />
        ))}
      </VariantRow>

      <VariantRow
        label="B — Inline badge"
        description="A small pill under the title that flips between Read-only and Editable. Always legible, costs one extra line of height."
      >
        {SAMPLES.map((s) => (
          <VariantBBadge key={s.themeKey} spec={s} />
        ))}
      </VariantRow>

      <VariantRow
        label="C — Segmented Eye / Pencil"
        description="Two-state segmented control, always visible. Most explicit / discoverable, tallest tile."
      >
        {SAMPLES.map((s) => (
          <VariantCSegmented key={s.themeKey} spec={s} />
        ))}
      </VariantRow>

      <VariantRow
        label="D — Hover-revealed row"
        description="Clean tile at rest; a labeled control row slides open on hover (and stays open when editable). Room to add keep-fresh / template later."
      >
        {SAMPLES.map((s) => (
          <VariantDHoverRow key={s.themeKey} spec={s} />
        ))}
      </VariantRow>
    </div>
  );
}
