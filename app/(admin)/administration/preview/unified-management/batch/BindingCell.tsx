"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Link2,
  MessageCircleQuestion,
  Type,
  Zap,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  valueById,
  type Binding,
  type BindingKind,
  type ConsumedKey,
  type KnownValue,
} from "./mock-data";

/**
 * The binding grammar of the real batch grid, generalised past surfaces:
 *
 *   green  — the place provides the value the template bound, BY IDENTITY.
 *            Auto-inherited and deliberately quiet: nothing to do.
 *   amber  — a value with the same KEY exists here, under a different identity.
 *            Keys are matchmaking hints, so a human confirms the re-match.
 *   violet — no path, but the key is optional: ask the person at run time.
 *   RED    — required, and nothing works. The only loud state.
 */

const KIND_META: Record<
  BindingKind,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }
> = {
  known_value: {
    label: "Known value",
    icon: Zap,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  rematch: {
    label: "Re-match by name",
    icon: Link2,
    tone: "text-amber-600 dark:text-amber-400",
  },
  direct_value: {
    label: "Direct value",
    icon: Type,
    tone: "text-sky-600 dark:text-sky-400",
  },
  prompt_user: {
    label: "Prompt user",
    icon: MessageCircleQuestion,
    tone: "text-violet-600 dark:text-violet-400",
  },
  unresolved: {
    label: "Nothing available",
    icon: AlertTriangle,
    tone: "text-rose-600 dark:text-rose-400",
  },
};

const KIND_ORDER: BindingKind[] = [
  "known_value",
  "rematch",
  "direct_value",
  "prompt_user",
];

function bindingForKind(
  next: BindingKind,
  current: Binding,
  candidates: readonly KnownValue[],
  consumed: ConsumedKey,
): Binding {
  switch (next) {
    case "known_value": {
      const pick =
        candidates.find((v) => v.id === consumed.templateValueId) ??
        candidates.find((v) => v.key === consumed.key) ??
        candidates[0];
      return pick ? { kind: "known_value", valueId: pick.id } : { kind: "unresolved" };
    }
    case "rematch": {
      const pick = candidates.find((v) => v.key === consumed.key) ?? candidates[0];
      return pick
        ? { kind: "rematch", valueId: pick.id, confirmed: false }
        : { kind: "unresolved" };
    }
    case "direct_value":
      return {
        kind: "direct_value",
        literal: current.kind === "direct_value" ? current.literal : "",
      };
    case "prompt_user":
      return {
        kind: "prompt_user",
        prompt:
          current.kind === "prompt_user"
            ? current.prompt
            : `Enter ${consumed.label}`,
      };
    case "unresolved":
      return { kind: "unresolved" };
  }
}

export function BindingCell({
  consumed,
  binding,
  candidates,
  placeLabel,
  onChange,
  compact = true,
}: {
  consumed: ConsumedKey;
  binding: Binding;
  /** The known values this place can actually read/write. */
  candidates: readonly KnownValue[];
  placeLabel: string;
  onChange: (next: Binding) => void;
  compact?: boolean;
}) {
  const [kindOpen, setKindOpen] = useState(false);
  const meta = KIND_META[binding.kind];
  const h = compact ? "h-7 text-xs" : "h-8 text-sm";

  const needsConfirm = binding.kind === "rematch" && !binding.confirmed;
  const isRed = binding.kind === "unresolved";

  return (
    <div
      className={cn(
        "flex items-center gap-1 min-w-0 rounded-md",
        needsConfirm &&
          "ring-1 ring-amber-300 dark:ring-amber-700/70 bg-amber-50/60 dark:bg-amber-950/20 px-1 py-0.5",
        isRed &&
          "ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50/60 dark:bg-rose-950/20 px-1 py-0.5",
      )}
    >
      {/* Kind switcher — nothing is ever locked, any cell can become anything */}
      <Popover open={kindOpen} onOpenChange={setKindOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`${meta.label} — click to change`}
            className={cn(
              "shrink-0 flex h-7 w-7 items-center justify-center rounded border border-border bg-background transition-colors hover:bg-accent/60",
            )}
          >
            <meta.icon className={cn("h-3.5 w-3.5", meta.tone)} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {placeLabel}
          </p>
          {KIND_ORDER.map((k) => {
            const M = KIND_META[k];
            const active = k === binding.kind;
            const disabled =
              (k === "known_value" || k === "rematch") && candidates.length === 0;
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(bindingForKind(k, binding, candidates, consumed));
                  setKindOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-accent/60 text-muted-foreground",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <M.icon className={cn("h-3.5 w-3.5 shrink-0", M.tone)} />
                <span className="truncate">{M.label}</span>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <div className="flex-1 min-w-0">
        {binding.kind === "known_value" && (
          <KnownValueSelect
            valueId={binding.valueId}
            candidates={candidates}
            className={h}
            onChange={(id) => onChange({ kind: "known_value", valueId: id })}
          />
        )}

        {binding.kind === "rematch" && (
          <RematchChip
            consumed={consumed}
            valueId={binding.valueId}
            confirmed={binding.confirmed}
            onConfirm={() =>
              onChange({ kind: "rematch", valueId: binding.valueId, confirmed: true })
            }
          />
        )}

        {binding.kind === "direct_value" && (
          <Input
            value={binding.literal}
            onChange={(e) =>
              onChange({ kind: "direct_value", literal: e.target.value })
            }
            placeholder="Literal value"
            className={cn(h, "w-full")}
          />
        )}

        {binding.kind === "prompt_user" && (
          <Input
            value={binding.prompt}
            onChange={(e) =>
              onChange({ kind: "prompt_user", prompt: e.target.value })
            }
            placeholder="Prompt text"
            className={cn(h, "w-full")}
          />
        )}

        {binding.kind === "unresolved" && (
          <span className="block truncate px-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
            No <span className="font-mono">{consumed.key}</span> here
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The UUID-identity rule made visible. The user does not see "matched" — they
 * see WHOSE value they are about to be bound to, and press Confirm.
 */
function RematchChip({
  consumed,
  valueId,
  confirmed,
  onConfirm,
}: {
  consumed: ConsumedKey;
  valueId: string;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const v = valueById(valueId);
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span
        className={cn(
          "min-w-0 truncate rounded px-1.5 py-0.5 font-mono text-[11px]",
          confirmed
            ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
            : "text-amber-800 dark:text-amber-200 bg-amber-500/15",
        )}
        title={`Same key, different identity (${valueId}) — confirm the match`}
      >
        {consumed.key} → {v?.owner ?? "unknown"} · {v?.key ?? "?"}
      </span>
      {confirmed ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          className="shrink-0 rounded border border-amber-400/70 dark:border-amber-600/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-500/20"
        >
          Confirm
        </button>
      )}
    </div>
  );
}

function KnownValueSelect({
  valueId,
  candidates,
  className,
  onChange,
}: {
  valueId: string;
  candidates: readonly KnownValue[];
  className?: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={valueId} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder="Pick value…" />
      </SelectTrigger>
      <SelectContent>
        {candidates.length === 0 && (
          <SelectItem value="__none__" disabled>
            This place provides nothing
          </SelectItem>
        )}
        {candidates.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            <span className="flex items-center gap-1.5">
              <span className="text-xs">{v.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {v.owner}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
