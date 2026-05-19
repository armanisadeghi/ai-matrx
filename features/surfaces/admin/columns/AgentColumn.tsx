"use client";

import { useState } from "react";
import {
  Compass,
  Boxes,
  Database,
  FileText,
  Info,
  Variable
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/styles/themes/utils";
import type {
  AgentDefinition,
  VariableDefinition,
  VariableComponentType,
} from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";

/**
 * Column 2 — Agent.
 *
 * Three clearly-separated blocks: identity (top, on card bg), variables
 * (its own card), context slots (its own card). The blocks float on a
 * tinted page background so they read as distinct surfaces.
 *
 * Variable rows surface the three load-bearing facts at a glance:
 * the pretty name, the default value (when set), and the input
 * component type (Textarea, Slider, …). Hover reveals the help text;
 * clicking opens a detail dialog with every field on the definition.
 */
export function AgentColumn({ agent }: { agent: AgentDefinition }) {
  const variables = agent.variableDefinitions ?? [];
  const slots = agent.contextSlots ?? [];

  const [detailVar, setDetailVar] = useState<VariableDefinition | null>(null);
  const [detailSlot, setDetailSlot] = useState<ContextSlot | null>(null);

  return (
    <div className="h-full flex flex-col bg-muted/50 pt-[var(--shell-header-h)]">
      {/* Identity card */}
      <div className="shrink-0 mx-3 mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Compass className="h-3.5 w-3.5" />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Agent
          </div>
        </div>
        <div className="text-base font-semibold text-foreground leading-tight">
          {agent.name}
        </div>
        {agent.description && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {agent.description}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 pt-3 pb-4 space-y-3">
        <SectionCard
          title="Variables"
          icon={Variable}
          count={variables.length}
          accent="text-emerald-600 bg-emerald-500/10"
        >
          {variables.length === 0 ? (
            <EmptyRow label="No variables declared" />
          ) : (
            <ul className="divide-y divide-border/60">
              {variables.map((v) => (
                <VariableRow
                  key={v.name}
                  variable={v}
                  onOpen={() => setDetailVar(v)}
                />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Context Slots"
          icon={Boxes}
          count={slots.length}
          accent="text-sky-600 bg-sky-500/10"
        >
          {slots.length === 0 ? (
            <EmptyRow label="No context slots declared" />
          ) : (
            <ul className="divide-y divide-border/60">
              {slots.map((s) => (
                <ContextSlotRow
                  key={s.key}
                  slot={s}
                  onOpen={() => setDetailSlot(s)}
                />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {detailVar && (
        <VariableDetailDialog
          variable={detailVar}
          onClose={() => setDetailVar(null)}
        />
      )}
      {detailSlot && (
        <ContextSlotDetailDialog
          slot={detailSlot}
          onClose={() => setDetailSlot(null)}
        />
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/30">
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md",
            accent,
          )}
        >
          <Icon className="h-3 w-3" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="ml-auto inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-medium tabular-nums bg-background text-muted-foreground border border-border">
          {count}
        </span>
      </header>
      <div className="bg-card">{children}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function prettyComponentType(type: VariableComponentType | undefined): string {
  const t = type ?? "textarea";
  return t
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function previewDefault(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (value === "") return null;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variable row
// ─────────────────────────────────────────────────────────────────────────────

function VariableRow({
  variable,
  onOpen,
}: {
  variable: VariableDefinition;
  onOpen: () => void;
}) {
  const defaultPreview = previewDefault(variable.defaultValue);
  const componentLabel = prettyComponentType(variable.customComponent?.type);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={variable.helpText || "Click for details"}
        className="group w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors min-w-0 flex items-start gap-2.5"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {formatVariableDisplayName(variable.name)}
            </span>
            {variable.required && (
              <span className="shrink-0 inline-flex items-center px-1.5 h-4 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600">
                Required
              </span>
            )}
            {variable.helpText && (
              <Info className="h-3 w-3 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground transition-colors" />
            )}
          </div>
          <dl className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex items-baseline gap-2 min-w-0">
              <dt className="shrink-0 w-[72px] text-muted-foreground">
                Component
              </dt>
              <dd className="text-foreground/85 truncate">{componentLabel}</dd>
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <dt className="shrink-0 w-[72px] text-muted-foreground">
                Default
              </dt>
              <dd
                className={cn(
                  "min-w-0 line-clamp-3 break-words leading-snug",
                  defaultPreview
                    ? "text-foreground/85"
                    : "text-muted-foreground/60 italic",
                )}
              >
                {defaultPreview ?? "Not set"}
              </dd>
            </div>
          </dl>
        </div>
      </button>
    </li>
  );
}

function VariableDetailDialog({
  variable,
  onClose,
}: {
  variable: VariableDefinition;
  onClose: () => void;
}) {
  const defaultPreview = previewDefault(variable.defaultValue);
  const componentLabel = prettyComponentType(variable.customComponent?.type);
  const cc = variable.customComponent;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{formatVariableDisplayName(variable.name)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1 pb-2 text-sm">
          {variable.helpText && (
            <p className="text-muted-foreground leading-relaxed">
              {variable.helpText}
            </p>
          )}
          <DetailRow label="Component" value={componentLabel} />
          <DetailRow
            label="Required"
            value={variable.required ? "Yes" : "No"}
          />
          <DetailRow
            label="Default value"
            value={defaultPreview ?? "—"}
            mono={defaultPreview != null}
          />
          {cc?.options && cc.options.length > 0 && (
            <DetailRow
              label="Options"
              value={cc.options.join(", ")}
            />
          )}
          {cc?.toggleValues && (
            <DetailRow
              label="Toggle values"
              value={`${cc.toggleValues[0]} / ${cc.toggleValues[1]}`}
            />
          )}
          {(cc?.min != null || cc?.max != null || cc?.step != null) && (
            <DetailRow
              label="Range"
              value={[
                cc?.min != null ? `min ${cc.min}` : null,
                cc?.max != null ? `max ${cc.max}` : null,
                cc?.step != null ? `step ${cc.step}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
          {cc?.allowOther && (
            <DetailRow label="Allow custom input" value="Yes" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Context slot row
// ─────────────────────────────────────────────────────────────────────────────

function ContextSlotRow({
  slot,
  onOpen,
}: {
  slot: ContextSlot;
  onOpen: () => void;
}) {
  const TypeIcon = slot.type === "json" ? Database : FileText;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={slot.description || "Click for details"}
        className="group w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors flex items-center gap-2.5 min-w-0"
      >
        <div className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <TypeIcon className="h-3 w-3" />
        </div>
        <div className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
          {slot.label ?? formatVariableDisplayName(slot.key)}
        </div>
        {slot.description && (
          <Info className="h-3 w-3 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground transition-colors" />
        )}
        <span className="shrink-0 inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
          {slot.type}
        </span>
      </button>
    </li>
  );
}

function ContextSlotDetailDialog({
  slot,
  onClose,
}: {
  slot: ContextSlot;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {slot.label ?? formatVariableDisplayName(slot.key)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1 pb-2 text-sm">
          {slot.description && (
            <p className="text-muted-foreground leading-relaxed">
              {slot.description}
            </p>
          )}
          <DetailRow label="Type" value={slot.type} mono />
          {slot.max_inline_chars != null && (
            <DetailRow
              label="Max inline chars"
              value={String(slot.max_inline_chars)}
            />
          )}
          {slot.summary_agent_id && (
            <DetailRow
              label="Summary agent id"
              value={slot.summary_agent_id}
              mono
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm text-foreground break-words",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-xs text-muted-foreground italic text-center">
      {label}
    </div>
  );
}
