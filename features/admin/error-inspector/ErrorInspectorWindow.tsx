"use client";

/**
 * ErrorInspectorWindow — admin-only WindowPanel that lists every Supabase /
 * PostgREST error captured in the live session (from anywhere in the app) with
 * full raw detail and per-error / whole-list "Copy for AI". Built for the 2026
 * DB transition: when a moved table or renamed RPC breaks a query on some page,
 * the exact error, its code, the table/function, the route, and the issuing
 * call-site all land here.
 *
 * Data comes from the module-level capture store (lib/diagnostics) via
 * `useCapturedErrors`. The store is fed by the wrapped Supabase browser client.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Database,
  Trash2,
  X,
} from "lucide-react";
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
  capturedErrorLabel,
  capturedErrorToAgentInput,
  capturedErrorToHuman,
  capturedErrorsToAgentInput,
  capturedErrorsToHuman,
} from "@/lib/diagnostics/buildCapturedErrorPayload";

interface ErrorInspectorWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

function relativeTime(ms: number): string {
  if (!ms) return "";
  const delta = Date.now() - ms;
  if (delta < 5_000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function codeTone(e: CapturedError): string {
  if (e.source === "supabase-exception")
    return "bg-destructive/15 text-destructive border-destructive/30";
  if (e.code === "PGRST116")
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (e.code === "42501")
    return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-primary/10 text-primary border-primary/25";
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

export default function ErrorInspectorWindow({
  isOpen,
  onClose,
}: ErrorInspectorWindowProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const errors = useCapturedErrors();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mark everything seen whenever the inspector is open (resets the badge).
  useEffect(() => {
    if (isOpen) markAllSeen();
  }, [isOpen, errors.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return errors;
    return errors.filter((e) =>
      [
        e.message,
        e.code,
        e.relation,
        e.schema,
        e.operation,
        e.route,
        e.details,
        e.hint,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [errors, query]);

  const selected =
    filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  if (!isOpen) return null;
  if (!isAdmin) return null;

  const sidebar = (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 border-b border-border shrink-0">
        <Input
          placeholder="Filter by table, code, message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            {errors.length === 0
              ? "No Supabase errors captured yet."
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
                      "group w-full text-left rounded-md px-2 py-1.5 transition-colors",
                      active
                        ? "bg-accent"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 text-[10px] font-mono leading-tight",
                          codeTone(e),
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
          <Database className="h-4 w-4 text-primary shrink-0" />
          <span className="shrink-0">Supabase Error Inspector</span>
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
      onClose={onClose}
      sidebar={sidebar}
      sidebarDefaultSize={300}
      sidebarMinSize={220}
      sidebarClassName="bg-muted/10"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={
        errors.length > 0 ? (
          <CopyButtons
            size="sm"
            label="All captured Supabase errors"
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
                {selected.source === "supabase-exception" ? (
                  <Ban className="h-4 w-4 text-destructive" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded border px-1.5 text-[11px] font-mono",
                      codeTone(selected),
                    )}
                  >
                    {selected.code ?? selected.source}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {selected.operation}
                    {selected.relation ? ` · ${selected.relation}` : ""}
                  </span>
                  <div className="ml-auto">
                    <CopyButtons
                      size="icon"
                      label={`Supabase error: ${capturedErrorLabel(selected)}`}
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
              <Field label="Source" value={selected.source} />
              <Field label="Operation" value={selected.operation} />
              <Field label="Schema" value={selected.schema} />
              <Field label="Table / fn" value={selected.relation} />
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

            {selected.callSite && (
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Call site (where the query was issued)
                </div>
                <pre className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words overflow-x-auto">
                  {selected.callSite}
                </pre>
              </div>
            )}

            {selected.stack && selected.source === "supabase-exception" && (
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
          <Database className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">No Supabase errors captured</p>
          <p className="text-xs mt-1 max-w-xs">
            Every PostgREST error and failed Supabase call in this session will
            appear here automatically, with full detail and Copy for AI.
          </p>
        </div>
      )}
    </WindowPanel>
  );
}
