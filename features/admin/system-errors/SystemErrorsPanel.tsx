"use client";

/**
 * System Errors — the durable `public.system_error` ledger, read over the API.
 *
 * Every request crash / 5xx fault (aidream `api/errors.py`) and every
 * best-effort degradation captured through `record_error` lands in that table
 * with a full traceback. Until this page existed the only readers were aidream's
 * own dashboard and raw SQL, so a server-side alarm that wanted to point an
 * admin at its evidence had nowhere in THIS app to send them — the snapshot
 * capture-failure assist chip had to say "go look in the database".
 *
 * Deep-linkable by design: `?kind=…&hours=…` is what an alarm chip links to.
 * `kind` (not `error_type`) is the stable family name a producer records under —
 * `error_type` is the exception class and changes when the code changes.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { apiGet } from "@/lib/api/typed-client";
import { toast } from "@/lib/toast";

interface SystemErrorRow {
  id: string;
  kind?: string | null;
  request_id?: string | null;
  user_id?: string | null;
  conversation_id?: string | null;
  source_app?: string | null;
  route?: string | null;
  error_type?: string | null;
  error_text?: string | null;
  traceback?: string | null;
  occurred_at?: string | null;
  resolved_at?: string | null;
}

interface RecentResponse {
  errors: SystemErrorRow[];
  count: number;
  filter_summary: string;
}

const HOUR_PRESETS = [6, 24, 72, 168] as const;

function summarize(row: SystemErrorRow): string {
  return [
    `id: ${row.id}`,
    `kind: ${row.kind ?? "—"}`,
    `error_type: ${row.error_type ?? "—"}`,
    `route: ${row.route ?? "—"}`,
    `occurred_at: ${row.occurred_at ?? "—"}`,
    `request_id: ${row.request_id ?? "—"}`,
    `conversation_id: ${row.conversation_id ?? "—"}`,
    "",
    row.error_text ?? "",
    "",
    row.traceback ?? "(no traceback recorded)",
  ].join("\n");
}

export default function SystemErrorsPanel() {
  // The deep link IS the initial state — an alarm chip arrives as
  // `?kind=…&hours=…`, so it seeds the filters rather than being applied by an
  // effect after a first wrong-filtered render.
  const searchParams = useSearchParams();
  const linkedHours = Number(searchParams.get("hours"));
  const [kind, setKind] = useState(() => searchParams.get("kind") ?? "");
  const [hours, setHours] = useState(() =>
    Number.isFinite(linkedHours) && linkedHours > 0
      ? Math.min(linkedHours, 720)
      : 24,
  );
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const trimmedKind = kind.trim();
  const {
    data,
    isFetching: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["system-errors", trimmedKind, hours, unresolvedOnly],
    queryFn: async (): Promise<RecentResponse> => {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const query: Record<string, string | number | boolean> = {
        since,
        limit: 200,
      };
      if (trimmedKind) query.kind = trimmedKind;
      if (unresolvedOnly) query.unresolved_only = true;
      const result = await apiGet("/admin/system-errors/recent", { query });
      return result.data as unknown as RecentResponse;
    },
  });

  const rows = useMemo(() => data?.errors ?? [], [data]);
  const summaryText = data?.filter_summary ?? "";
  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? String(queryError)
        : null;

  const byKind = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.kind ?? "(no kind)";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [rows]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> System Errors
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The durable <code>public.system_error</code> ledger — every request
            crash and every captured degradation, with its full traceback.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <Input
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="Filter by kind, e.g. request_snapshot_capture_failure"
          className="h-9 w-96 max-w-full"
        />
        <div className="flex items-center gap-1">
          {HOUR_PRESETS.map((h) => (
            <Button
              key={h}
              size="sm"
              variant={hours === h ? "default" : "outline"}
              onClick={() => setHours(h)}
            >
              {h}h
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant={unresolvedOnly ? "default" : "outline"}
          onClick={() => setUnresolvedOnly((v) => !v)}
        >
          Unresolved only
        </Button>
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          {loading ? (
            <SuspenseLoader centered={false} size="xs" message="Loading system errors…" />
          ) : (
            `${rows.length} row(s)`
          )}
        </span>
      </div>

      {summaryText ? (
        <div className="text-xs text-gray-500 dark:text-gray-500">
          {summaryText}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {byKind.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {byKind.map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k === "(no kind)" ? "" : k)}
              className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {k} <span className="text-gray-400">({n})</span>
            </button>
          ))}
        </div>
      ) : null}

      {!loading && rows.length === 0 && !error ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          No errors recorded in this window
          {kind.trim() ? ` for kind “${kind.trim()}”` : ""}. That is good news —
          widen the window or clear the filter to double-check.
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const isOpen = expanded.has(row.id);
          return (
            <div
              key={row.id}
              className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            >
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{row.kind ?? "no kind"}</Badge>
                    {row.error_type ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {row.error_type}
                      </span>
                    ) : null}
                    {row.route ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {row.route}
                      </span>
                    ) : null}
                    {row.resolved_at ? (
                      <Badge variant="outline">resolved</Badge>
                    ) : null}
                    <span className="ml-auto text-xs text-gray-400">
                      {row.occurred_at
                        ? new Date(row.occurred_at).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-gray-800 dark:text-gray-200">
                    {row.error_text ?? "(no message)"}
                  </div>
                </div>
              </button>
              {isOpen ? (
                <div className="border-t border-gray-200 p-3 dark:border-gray-700">
                  <div className="mb-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(summarize(row));
                        toast.success("Error copied for AI");
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy for AI
                    </Button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      request_id: {row.request_id ?? "—"}
                    </span>
                  </div>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    {row.traceback ?? "(no traceback recorded)"}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
