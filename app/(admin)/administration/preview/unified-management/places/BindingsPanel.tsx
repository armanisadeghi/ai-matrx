"use client";

/**
 * 2. BINDINGS — the REFERENCED half, with THE AUTO-RUN CONTROL.
 *
 * The harvest's answer was blunt: *there is no auto-run control on a binding
 * anywhere*. A manifest role carries a code-owned, read-only tri-state
 * (`auto-run: always | never | user-choice`); a shortcut carries a user-owned
 * boolean. Same idea, opposite authority — the inversion.
 *
 * The fix, made visible: ONE user-owned switch per binding, at whatever level
 * you are standing at, with THE-MODEL law 7 stated inline beside it —
 * *fully mapped → runs instantly; prompts only for gaps.* The switch is
 * therefore never the whole story; the mapping-completeness read next to it is,
 * which is why the two live on the same row.
 */

import { useState } from "react";
import {
  Bot,
  ChevronDown,
  CircleHelp,
  GitBranch,
  Play,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Inert, Panel, RuleNote } from "./preview-chrome";
import {
  BINDINGS,
  KNOWN_VALUE_BY_ID,
  type BindingInput,
  type MappingSource,
  type PlaceBinding,
} from "./mock-data";

const SOURCE_META: Record<
  MappingSource,
  { label: string; className: string; isGap: boolean }
> = {
  place_value: {
    label: "place value",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    isGap: false,
  },
  known_value: {
    label: "known value",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    isGap: false,
  },
  direct: {
    label: "direct value",
    className:
      "border-zinc-400/40 bg-muted text-foreground",
    isGap: false,
  },
  prompt_user: {
    label: "prompt user",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    isGap: true,
  },
  unmapped: {
    label: "unmapped",
    className: "border-destructive/40 bg-destructive/5 text-destructive",
    isGap: true,
  },
};

function sourceLabel(input: BindingInput): string {
  if (input.source === "known_value" && input.from) {
    return KNOWN_VALUE_BY_ID.get(input.from)?.key ?? input.from;
  }
  return input.from ?? "—";
}

function completeness(binding: PlaceBinding) {
  const gaps = binding.inputs.filter((i) => SOURCE_META[i.source].isGap);
  return {
    mapped: binding.inputs.length - gaps.length,
    total: binding.inputs.length,
    gaps,
    fullyMapped: gaps.length === 0,
  };
}

function BindingRow({
  binding,
  autoRun,
  onAutoRunChange,
  readOnly,
}: {
  binding: PlaceBinding;
  autoRun: boolean;
  onAutoRunChange: (next: boolean) => void;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const c = completeness(binding);
  const HolderIcon = binding.holder.type === "workflow" ? GitBranch : Bot;

  /** The whole rule, resolved for THIS row. */
  const behaviour = autoRun
    ? c.fullyMapped
      ? {
          text: "Runs instantly. Every input is mapped — nothing to ask.",
          className: "text-emerald-600 dark:text-emerald-400",
          Icon: Zap,
        }
      : {
          text: `Runs on open and prompts for ${c.gaps.length} gap${
            c.gaps.length === 1 ? "" : "s"
          } only — never for the ${c.mapped} it already knows.`,
          className: "text-amber-600 dark:text-amber-400",
          Icon: CircleHelp,
        }
    : {
        text: "Waits for the rep to press Run. Auto-run off is the flexibility option, not the norm.",
        className: "text-muted-foreground",
        Icon: Play,
      };

  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate font-mono text-xs text-foreground group-hover:underline">
              {binding.mandateKey}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
              {binding.goal}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="gap-1 text-[10px]">
                <HolderIcon className="h-3 w-3" />
                {binding.holder.name}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {binding.holder.tier}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                →&nbsp;{binding.outputKind}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {binding.slot}
              </span>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] tabular-nums",
              c.fullyMapped
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {c.mapped}/{c.total} mapped
            {c.fullyMapped ? "" : ` · ${c.gaps.length} gap`}
          </Badge>
          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-[11px] font-medium text-foreground">
              Auto-run
            </span>
            <Switch
              checked={autoRun}
              onCheckedChange={onAutoRunChange}
              aria-label={`Auto-run ${binding.mandateKey}`}
            />
          </label>
        </div>
      </div>

      <p
        className={cn(
          "mt-2 flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-snug",
          behaviour.className,
        )}
      >
        <behaviour.Icon className="mt-px h-3.5 w-3.5 shrink-0" />
        {behaviour.text}
      </p>

      {open && (
        <div className="mt-2 rounded-md border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Consumption map
            </span>
            <span className="text-[10px] text-muted-foreground">
              scope tier: {binding.scopeTier}
            </span>
          </div>
          <div className="divide-y divide-border">
            {binding.inputs.map((input) => {
              const meta = SOURCE_META[input.source];
              return (
                <div
                  key={input.key}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5"
                >
                  <span className="font-mono text-[11px] text-foreground">
                    {input.key}
                  </span>
                  <span className="text-[10px] text-muted-foreground">←</span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", meta.className)}
                  >
                    {meta.label}
                  </Badge>
                  {!meta.isGap && (
                    <code className="truncate font-mono text-[10px] text-muted-foreground">
                      {sourceLabel(input)}
                    </code>
                  )}
                  {input.note && (
                    <span className="w-full text-[10px] leading-snug text-muted-foreground">
                      {input.note}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!readOnly && (
            <div className="flex items-center justify-end gap-1.5 border-t border-border px-2 py-1.5">
              <Inert what="open the value-mapping editor for this binding">
                <Button variant="outline" size="sm" className="h-6 text-[11px]">
                  Edit mapping
                </Button>
              </Inert>
              <Inert what="open the per-target write-policy editor">
                <Button variant="outline" size="sm" className="h-6 text-[11px]">
                  Write policy
                </Button>
              </Inert>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BindingsPanel({ readOnly }: { readOnly: boolean }) {
  const [autoRun, setAutoRun] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BINDINGS.map((b) => [b.id, b.autoRun])),
  );

  return (
    <Panel
      eyebrow="2 · Jobs this place names"
      title="Bindings"
      count={
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {BINDINGS.length} referenced
        </Badge>
      }
      actions={
        !readOnly ? (
          <Inert what="open the surface-first bind composer">
            <Button variant="outline" size="sm" className="h-7 text-[11px]">
              Bind a holder
            </Button>
          </Inert>
        ) : undefined
      }
    >
      <RuleNote>
        <b className="text-foreground">Auto-run is the referenced norm.</b> A
        fully-mapped binding runs instantly with no user input; a binding with
        gaps prompts for <i>exactly</i> the gaps. Prompting for everything is the
        old default and is not a setting here. The switch is user-owned at every
        level — the one thing the manifest&rsquo;s read-only{" "}
        <code className="font-mono">auto-run</code> enum could never be.
      </RuleNote>
      <div className="divide-y divide-border">
        {BINDINGS.map((b) => (
          <BindingRow
            key={b.id}
            binding={b}
            readOnly={readOnly}
            autoRun={autoRun[b.id] ?? b.autoRun}
            onAutoRunChange={(next) =>
              setAutoRun((prev) => ({ ...prev, [b.id]: next }))
            }
          />
        ))}
      </div>
    </Panel>
  );
}
