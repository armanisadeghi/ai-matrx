"use client";

/**
 * ErrorInspectorWindow — admin-only WindowPanel that lists every runtime error
 * captured in the live session, from ANY source (Supabase/PostgREST, uncaught
 * runtime exceptions, unhandled rejections, console.error, Python-backend HTTP
 * failures, React render errors), with full raw detail, the visibility tier,
 * a ready-to-paste downgrade rule, and per-error / whole-list "Copy for AI".
 *
 * Data comes from the module-level capture store (lib/diagnostics) via
 * `useCapturedErrors`, fed by the per-source capture adapters.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Bug, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useCapturedErrors } from "@/lib/diagnostics/useCapturedErrors";
import {
  clearCapturedErrors,
  dismissCapturedError,
  markAllSeen,
  type CapturedError,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  ERROR_TIERS,
  TIERS_BY_RANK,
  tierMeta,
  type ErrorTier,
} from "@/lib/diagnostics/errorTiers";
import {
  TIER_RULES_FILE,
  buildDowngradeRuleStub,
} from "@/lib/diagnostics/errorTierRules";
import {
  capturedErrorLabel,
  capturedErrorToAgentInput,
  capturedErrorToHuman,
  capturedErrorsToAgentInput,
  capturedErrorsToHuman,
  sourceLabel,
} from "@/lib/diagnostics/buildCapturedErrorPayload";

interface ErrorInspectorWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

type TierFilter = ErrorTier | "all";

function relativeTime(ms: number): string {
  if (!ms) return "";
  const delta = Date.now() - ms;
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function Field({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1 border-b border-border/50">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground break-words whitespace-pre-wrap font-mono">
        {value}
      </span>
    </div>
  );
}

function TierChip({ tier }: { tier: ErrorTier }) {
  const t = tierMeta(tier);
  return (
    <span
      className={cn(
        "rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide",
        t.chipClass,
      )}
    >
      {t.label}
    </span>
  );
}

export default function ErrorInspectorWindow({
  isOpen,
  onClose,
}: ErrorInspectorWindowProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const errors = useCapturedErrors();
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mark everything seen whenever the inspector is open (resets the badge).
  useEffect(() => {
    if (isOpen) markAllSeen();
  }, [isOpen, errors.length]);

  const tierCounts = useMemo(() => {
    const c: Record<TierFilter, number> = {
      all: errors.length,
      red: 0,
      orange: 0,
      yellow: 0,
    };
    for (const e of errors) c[e.tier] += 1;
    return c;
  }, [errors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return errors.filter((e) => {
      if (tierFilter !== "all" && e.tier !== tierFilter) return false;
      if (!q) return true;
      return [
        e.message,
        e.code,
        e.relation,
        e.schema,
        e.operation,
        e.source,
        e.route,
        e.details,
        e.hint,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [errors, query, tierFilter]);

  const selected =
    filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  if (!isOpen) return null;
  if (!isAdmin) return null;

  const sidebar = (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 border-b border-border shrink-0 space-y-2">
        <Input
          placeholder="Filter by source, table, code, message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="flex items-center gap-1">
          {(["all", ...TIERS_BY_RANK] as TierFilter[]).map((t) => {
            const active = tierFilter === t;
            const dot =
              t === "all" ? null : (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    ERROR_TIERS[t].dotClass,
                  )}
                />
              );
            return (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {dot}
                <span className="capitalize">{t}</span>
                <span className="tabular-nums opacity-70">{tierCounts[t]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            {errors.length === 0
              ? "No errors captured yet."
              : "No errors match the filter."}
          </div>
        ) : (
          <ul className="p-1 space-y-0.5">
            {filtered.map((e) => {
              const active = selected?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelectedId(e.id)}
                    className={cn(
                      "group w-full text-left rounded-md border-l-2 px-2 py-1.5 transition-colors",
                      tierMeta(e.tier).accentClass,
                      active
                        ? "bg-accent"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 text-[10px] font-mono leading-tight",
                          tierMeta(e.tier).chipClass,
                        )}
                      >
                        {e.code ?? e.operation}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground">
                        {e.relation ?? capturedErrorLabel(e)}
                      </span>
                      {e.count > 1 && (
                        <span className="ml-auto shrink-0 rounded-full bg-destructive/20 text-destructive px-1.5 text-[10px] font-semibold">
                          ×{e.count}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {e.message}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                      <span className="shrink-0 font-medium">
                        {sourceLabel(e.source)}
                      </span>
                      <span className="opacity-50">·</span>
                      <span className="truncate">{e.route || "—"}</span>
                      <span className="ml-auto shrink-0">
                        {relativeTime(e.lastAt)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <WindowPanel
      titleNode={
        <span className="flex items-center gap-1.5 min-w-0">
          <Bug className="h-4 w-4 text-primary shrink-0" />
          <span className="shrink-0">Error Inspector</span>
          {errors.length > 0 && (
            <span className="rounded-full bg-destructive/20 text-destructive px-1.5 text-[11px] font-semibold shrink-0">
              {errors.length}
            </span>
          )}
        </span>
      }
      width={920}
      height={640}
      minWidth={680}
      minHeight={420}
      overlayId="errorInspectorWindow"
      onClose={onClose}
      sidebar={sidebar}
      sidebarDefaultSize={320}
      sidebarMinSize={240}
      sidebarClassName="bg-muted/10"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={
        errors.length > 0 ? (
          <CopyButtons
            size="sm"
            label="All captured errors"
            human={() => capturedErrorsToHuman(errors)}
            agent={() => capturedErrorsToAgentInput(errors)}
          />
        ) : undefined
      }
      footerLeft={
        <span className="text-xs text-muted-foreground">
          {errors.length} distinct ·{" "}
          {errors.reduce((s, e) => s + e.count, 0)} total occurrences
        </span>
      }
      footerRight={
        errors.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => {
              clearCapturedErrors();
              setSelectedId(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Clear all
          </Button>
        ) : undefined
      }
    >
      {selected ? (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                {selected.tier === "red" ? (
                  <Ban className="h-4 w-4 text-destructive" />
                ) : (
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4",
                      selected.tier === "orange"
                        ? "text-amber-500"
                        : "text-yellow-500",
                    )}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TierChip tier={selected.tier} />
                  <span
                    className={cn(
                      "rounded border px-1.5 text-[11px] font-mono",
                      tierMeta(selected.tier).chipClass,
                    )}
                  >
                    {selected.code ?? sourceLabel(selected.source)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {selected.operation !== "unknown"
                      ? selected.operation
                      : sourceLabel(selected.source)}
                    {selected.relation ? ` · ${selected.relation}` : ""}
                  </span>
                  <div className="ml-auto">
                    <CopyButtons
                      size="icon"
                      label={`Error: ${capturedErrorLabel(selected)}`}
                      human={() => capturedErrorToHuman(selected)}
                      agent={() => capturedErrorToAgentInput(selected)}
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground break-words">
                  {selected.message}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-md border border-border bg-card/40 px-3 py-1">
              <Field label="Source" value={sourceLabel(selected.source)} />
              <Field label="Tier" value={tierMeta(selected.tier).label} />
              {selected.tierReason && (
                <Field label="Tier reason" value={selected.tierReason} />
              )}
              <Field label="Operation" value={selected.operation} />
              <Field label="Schema" value={selected.schema} />
              <Field label="Table / fn / route" value={selected.relation} />
              <Field label="Code" value={selected.code} />
              <Field label="HTTP status" value={selected.status} />
              <Field label="Details" value={selected.details} />
              <Field label="Hint" value={selected.hint} />
              <Field label="Route" value={selected.route} />
              <Field label="Occurrences" value={selected.count} />
              <Field
                label="First seen"
                value={new Date(selected.firstAt).toLocaleString()}
              />
              <Field
                label="Last seen"
                value={new Date(selected.lastAt).toLocaleString()}
              />
            </div>

            {/* Downgrade — the "this shouldn't be an error" workflow. */}
            <div className="mt-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Downgrade this error&apos;s tier
              </div>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Not a real error? Use “Copy for AI” above and ask an agent to add
                this rule to{" "}
                <code className="rounded bg-muted/50 px-1 font-mono">
                  {TIER_RULES_FILE}
                </code>{" "}
                (set <span className="font-mono">tier</span> to{" "}
                <span className="text-amber-600 dark:text-amber-400">
                  orange
                </span>{" "}
                for a dot or{" "}
                <span className="text-yellow-600 dark:text-yellow-500">
                  yellow
                </span>{" "}
                to silence).
              </p>
              <pre className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words overflow-x-auto">
                {buildDowngradeRuleStub(selected)}
              </pre>
            </div>

            {selected.callSite && (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Call site / component stack
                </div>
                <pre className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words overflow-x-auto">
                  {selected.callSite}
                </pre>
              </div>
            )}

            {selected.stack && (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Stack
                </div>
                <pre className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words overflow-x-auto">
                  {selected.stack}
                </pre>
              </div>
            )}

            {selected.raw !== undefined && selected.raw !== null && (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Raw error object
                </div>
                <pre className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words overflow-x-auto">
                  {JSON.stringify(selected.raw, null, 2)}
                </pre>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  dismissCapturedError(selected.id);
                  setSelectedId(null);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Dismiss this error
              </Button>
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
          <Bug className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">No errors captured</p>
          <p className="text-xs mt-1 max-w-xs">
            Every runtime error in this session — Supabase, uncaught exceptions,
            rejected promises, console.error, backend HTTP failures, and React
            render errors — appears here automatically, with full detail and Copy
            for AI.
          </p>
        </div>
      )}
    </WindowPanel>
  );
}
