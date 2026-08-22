"use client";

/**
 * ConsumptionMapEditor — the zero-code rewiring surface for a mandate that
 * carries a Provision: shows the FULL OFFER (every value the call site makes
 * available — name, kind, guaranteed/optional, lazy, pinned-context lock) and
 * lets the binding author decide, per value, whether the bound Holder consumes
 * it and through which channel (variable ⇄ context), plus the absent-behavior
 * for optional values.
 *
 * Patterned on the surfaces binding UX (`features/surfaces/components/
 * ValueMappingEditor.tsx`) — same row anatomy, same shared `ValueMapping`
 * types (the neutral `offered_value` branch; see
 * `features/agents/mandates/provision-shapes.ts`).
 *
 * THE CALM RULE (Arman, 2026-08-22): an offered value consumed by nothing is
 * NORMAL — unused rows render as quietly available, never as errors or
 * warnings. The only blocking states are the server's 422s, pre-flighted by
 * `consumptionMapProblems`: an optional value with no absent-behavior, a
 * structured kind routed to a variable, a consumed name the offer lacks.
 */

import Link from "next/link";
import { Info, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  GENERIC_VALUE_KINDS,
  SCALAR_VALUE_KINDS,
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "../provision-shapes";
import type { ProvisionOffer } from "../provisions";

const WHEN_ABSENT_UNSET = "__unset__";

interface ConsumptionMapEditorProps {
  offer: ProvisionOffer;
  /** Offered values the MANDATE force-delivers as context (`pinned_context`)
   * — rendered locked; not part of the editable map. */
  pinnedContext: readonly string[];
  value: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  disabled?: boolean;
}

export function ConsumptionMapEditor({
  offer,
  pinnedContext,
  value,
  onChange,
  disabled = false,
}: ConsumptionMapEditorProps) {
  const pinned = new Set(pinnedContext);

  const setEntry = (name: string, entry: ConsumptionEntry | null) => {
    if (entry === null) {
      if (!(name in value)) return;
      const next = { ...value };
      delete next[name];
      onChange(next);
    } else {
      onChange({ ...value, [name]: entry });
    }
  };

  if (offer.values.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
        This provision offers no values — a data defect (a provision IS its
        values). Nothing to consume.
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-1.5">
        {offer.values.map((offered) => (
          <OfferedValueRow
            key={offered.name}
            offered={offered}
            entry={value[offered.name]}
            pinned={pinned.has(offered.name)}
            disabled={disabled}
            onChange={(entry) => setEntry(offered.name, entry)}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

/** Kind chip — links to `/shapes/[kind]` for registered content_ir kinds;
 * generic scalars (text, number, json, …) have no shape page. */
function KindChip({ kind }: { kind: string }) {
  const chip = (
    <Badge variant="outline" className="text-[10px] font-mono">
      {kind}
    </Badge>
  );
  if (GENERIC_VALUE_KINDS.has(kind)) return chip;
  return (
    <Link
      href={`/shapes/${encodeURIComponent(kind)}`}
      className="hover:opacity-80"
      title={`Open the ${kind} shape`}
    >
      {chip}
    </Link>
  );
}

function OfferedValueRow({
  offered,
  entry,
  pinned,
  disabled,
  onChange,
}: {
  offered: OfferedValue;
  entry: ConsumptionEntry | undefined;
  pinned: boolean;
  disabled: boolean;
  onChange: (entry: ConsumptionEntry | null) => void;
}) {
  const scalar = SCALAR_VALUE_KINDS.has(offered.kind);
  const consumed = entry !== undefined;
  const deliver = entry?.deliver ?? (scalar ? "variable" : "context");

  const toggleConsumed = (on: boolean) => {
    if (!on) {
      onChange(null);
      return;
    }
    onChange({
      mapType: "offered_value",
      target: offered.name,
      // Structured kinds may only ride context — the server 422s a variable.
      deliver: scalar ? "variable" : "context",
      ...(offered.guaranteed ? {} : { when_absent: "skip" as const }),
    });
  };

  return (
    <div
      className={cn(
        "rounded-md border bg-card",
        consumed || pinned ? "border-border" : "border-border/50",
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "font-mono text-xs",
                consumed || pinned ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {offered.name}
            </span>
            <KindChip kind={offered.kind} />
            {offered.guaranteed ? (
              <Badge variant="outline" className="text-[10px]">
                guaranteed
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground"
              >
                optional
              </Badge>
            )}
            {offered.lazy && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[10px]">
                    lazy
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Ships as a reference until actually consumed — an unconsumed
                  lazy value is never materialized.
                </TooltipContent>
              </Tooltip>
            )}
            {pinned && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> pinned context
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  The mandate force-delivers this value as context whenever the
                  call site supplies it — set by the mandate, not editable here.
                </TooltipContent>
              </Tooltip>
            )}
            {offered.description && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {offered.description}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {!consumed && !pinned && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Available — not consumed by this agent. That&apos;s fine.
            </p>
          )}
        </div>

        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch
            checked={consumed}
            onCheckedChange={toggleConsumed}
            disabled={disabled || pinned}
          />
          consume
        </label>
      </div>

      {consumed && entry && (
        <div className="space-y-1.5 border-t border-border bg-muted/30 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Deliver as
              <Select
                value={deliver}
                onValueChange={(v) =>
                  onChange({
                    ...entry,
                    deliver: v === "context" ? "context" : "variable",
                  })
                }
                disabled={disabled || !scalar}
              >
                <SelectTrigger className="h-6 w-28 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="variable" disabled={!scalar}>
                    variable
                  </SelectItem>
                  <SelectItem value="context">context</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {!scalar && (
              <span className="text-[10px] text-muted-foreground">
                Structured kind — context only (never serialized into a blob
                variable).
              </span>
            )}
            {!offered.guaranteed && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                When absent
                <Select
                  value={entry.when_absent ?? WHEN_ABSENT_UNSET}
                  onValueChange={(v) => {
                    const next: ConsumptionEntry = { ...entry };
                    if (v === WHEN_ABSENT_UNSET) delete next.when_absent;
                    else next.when_absent = v as "skip" | "use_default" | "fail";
                    if (next.when_absent !== "use_default") delete next.default;
                    onChange(next);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-6 w-32 text-[11px]">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">skip it</SelectItem>
                    <SelectItem value="use_default">use a default</SelectItem>
                    <SelectItem value="fail">refuse the run</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
          {!offered.guaranteed && entry.when_absent === "use_default" && (
            <Input
              value={typeof entry.default === "string" ? entry.default : ""}
              onChange={(e) =>
                onChange({ ...entry, default: e.target.value })
              }
              placeholder="Default value delivered when absent"
              className="h-7 text-[11px]"
              style={{ fontSize: "13px" }}
              disabled={disabled}
            />
          )}
        </div>
      )}
    </div>
  );
}
