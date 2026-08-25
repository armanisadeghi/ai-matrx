"use client";

/**
 * KindIncidentsTab — the Shape incident queue, on the Kind Registry.
 *
 * THE QUEUE HAD NO DOOR. `content_ir.kind_component_incident` collects every
 * render failure a Shape produces in the wild: the browser files
 * `compile_error` / `render_throw` / `transform_error` the moment a DB-authored
 * component fails in front of a real reader, and the aidream generic-floor
 * alarm files `generic_floor_render` when a kind reaches a reader through the
 * key/value dump because nothing is bound. The component-authoring agent has
 * read and closed these rows for months (`kindcomp_get_context` /
 * `kindcomp_resolve_incident`) — but no human surface ever showed them, so the
 * only way to learn a Shape was broken for other people was to hit it yourself.
 *
 * Every row carries its own fix: the kind opens (registry detail + the studio
 * preview), and "Fix with agent" hands THIS incident to the kind editor role
 * through the canonical `KindAgentButton` seam, so the agent arrives with the
 * registry's live surface scope and the failure in its brief.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import KindAgentButton from "@/features/content-ir/studio/components/KindAgentButton";
import {
  listKindIncidents,
  resolveKindIncident,
  reopenKindIncident,
  type IncidentScope,
  type KindIncidentRecord,
} from "@/features/content-ir/admin/incident-service";

const SCOPES: { id: IncidentScope; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

/**
 * What each failure MEANS, in the words of the person who has to fix it. An
 * error_type nobody documented still renders — with its raw token — because a
 * new producer must show up on this board, not be filtered out of it.
 */
const ERROR_TYPE_COPY: Record<string, { label: string; hint: string }> = {
  compile_error: {
    label: "Compile",
    hint: "The component source never became a component. Every reader saw the generic viewer.",
  },
  render_throw: {
    label: "Render throw",
    hint: "The component compiled and then threw while rendering real data.",
  },
  transform_error: {
    label: "Transform",
    hint: "props_transform failed; the component received the untransformed value.",
  },
  generic_floor_render: {
    label: "No component",
    hint: "Nothing is bound for this platform/role, so the reader got a key/value dump.",
  },
};

function typeCopy(errorType: string): { label: string; hint: string } {
  return (
    ERROR_TYPE_COPY[errorType] ?? {
      label: errorType,
      hint: "A producer filed this failure type; it has no description yet.",
    }
  );
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function JsonPeek({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function KindIncidentsTab() {
  const [scope, setScope] = useState<IncidentScope>("open");
  const [rows, setRows] = useState<KindIncidentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<KindIncidentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next: IncidentScope) => {
    setRows(null);
    setError(null);
    try {
      setRows(await listKindIncidents(supabase, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    let observations = 0;
    for (const row of rows ?? []) {
      byType.set(row.errorType, (byType.get(row.errorType) ?? 0) + 1);
      observations += row.occurrences;
    }
    return { byType, observations };
  }, [rows]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmResolve(note: string) {
    if (!resolving) return;
    setBusy(true);
    try {
      await resolveKindIncident(supabase, resolving.id, note);
      toast.success(`Closed the ${resolving.kind} incident`);
      setResolving(null);
      await load(scope);
    } catch (err) {
      toast.error("Could not resolve this incident", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function reopen(row: KindIncidentRecord) {
    try {
      await reopenKindIncident(supabase, row.id);
      toast.success(`Reopened the ${row.kind} incident`);
      await load(scope);
    } catch (err) {
      toast.error("Could not reopen this incident", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1">
          {SCOPES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setScope(entry.id)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                scope === entry.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {rows && (
          <span className="text-xs text-muted-foreground">
            {rows.length} incident{rows.length === 1 ? "" : "s"} ·{" "}
            {counts.observations} observation
            {counts.observations === 1 ? "" : "s"}
            {[...counts.byType.entries()].map(([type, n]) => (
              <span key={type}> · {n} {typeCopy(type).label.toLowerCase()}</span>
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={() => void load(scope)}
          className="ml-auto inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!rows && !error && (
          <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading the incident queue</span>
          </div>
        )}
        {rows?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">
              {scope === "open"
                ? "No open Shape incidents."
                : "Nothing in this view."}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Browsers file here the moment a Shape&apos;s component fails in
              front of a real reader, and the server files here when a kind
              renders through the generic viewer. An empty queue means every
              rendered Shape is currently reaching its component.
            </p>
          </div>
        )}

        {rows?.map((row) => {
          const copy = typeCopy(row.errorType);
          const isOpen = expanded.has(row.id);
          return (
            <div
              key={row.id}
              className="border-b border-border px-3 py-2 transition-colors hover:bg-accent/30"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Collapse details" : "Expand details"}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    row.resolved
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-500/10 text-red-700 dark:text-red-300"
                  }`}
                  title={copy.hint}
                >
                  {copy.label}
                </span>
                <Link
                  href={`/administration/utilities/kind-registry/${encodeURIComponent(row.kind)}`}
                  className="shrink-0 font-mono text-sm font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {row.kind}
                </Link>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {row.platform ?? "web"}/{row.role ?? "output"}
                  {row.componentKey ? ` · ${row.componentKey}` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {row.errorMessage}
                </span>
                <span
                  className="shrink-0 text-[11px] text-muted-foreground"
                  title={`First seen ${row.firstSeenAt ?? row.createdAt}`}
                >
                  ×{row.occurrences} · {ago(row.lastSeenAt ?? row.createdAt)}
                </span>
              </div>

              {isOpen && (
                <div className="mt-2 space-y-3 pl-6">
                  <p className="text-xs text-muted-foreground">{copy.hint}</p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground">
                    {row.errorMessage}
                  </pre>
                  {row.errorStack && (
                    <JsonPeek label="Stack" value={row.errorStack} />
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <JsonPeek label="Data shape" value={row.dataSnapshot} />
                    <JsonPeek label="Browser" value={row.browserInfo} />
                  </div>
                  {row.routes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Seen on
                      </span>
                      {row.routes.map((route) => (
                        <Link
                          key={route}
                          href={route}
                          className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-accent"
                        >
                          {route}
                        </Link>
                      ))}
                    </div>
                  )}
                  {row.resolved && row.resolutionNotes && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Resolved {ago(row.resolvedAt)}: {row.resolutionNotes}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/shapes/${encodeURIComponent(row.kind)}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open the Shape
                    </Link>
                    <KindAgentButton
                      kind={row.kind}
                      label={row.kind}
                      part="component"
                      note={
                        `An incident is open against this kind's ${row.platform ?? "web"}/${row.role ?? "output"} component. ` +
                        `Failure type: ${row.errorType}. Observed ${row.occurrences} time(s), most recently ${row.lastSeenAt ?? row.createdAt}. ` +
                        `Error: ${row.errorMessage} ` +
                        `Reproduce it, fix the component, and close incident ${row.id} with kindcomp_resolve_incident.`
                      }
                    >
                      Fix with agent
                    </KindAgentButton>
                    {row.resolved ? (
                      <button
                        type="button"
                        onClick={() => void reopen(row)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setResolving(row)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                      >
                        <Check className="h-3.5 w-3.5" /> Resolve
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TextInputDialog
        open={resolving !== null}
        onOpenChange={(open) => !busy && !open && setResolving(null)}
        title="Resolve this incident"
        description={
          resolving
            ? `Say what was done for ${resolving.kind}. The note is what the next agent reads instead of re-investigating.`
            : ""
        }
        placeholder="e.g. Rewrote the namespace import; verified against the canonical example."
        confirmLabel="Resolve"
        busy={busy}
        onConfirm={confirmResolve}
      />
    </div>
  );
}
