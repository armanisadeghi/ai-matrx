"use client";

/**
 * HELD-OUT CASES — the Rulebook's sealed exam paper (unfolding-case contract
 * §1 + §5).
 *
 * A held-out case is a `platform.masterwork_corpus_item` row with
 * `kind = "timeline"` and `metadata.role = "heldout"`. The Masterwork is
 * EXAMINED on it and never learns from it: no rule is ever distilled from one,
 * and its later steps and its resolution are read by exactly two callers — the
 * case-oracle node and the unfolding judge.
 *
 * 🚨 So this list shows the LABEL, the date and the licence, and nothing else.
 * Never the narrative, never a step, never how it turned out. The read below
 * selects only those columns, so there is nothing in the component's props to
 * leak even by accident — the withholding law enforced by the query, not by
 * good intentions.
 *
 * The list is treated as COMPLETE (a count is printed), so it is read with
 * `readAllRows` — a bare `.select()` silently caps at 1000 rows.
 *
 * THE DOOR LAW's one deliberate exception in this feature: these rows name an
 * identity and do NOT open. A door onto a sealed case is a door onto the
 * answer, which is the one thing the held-out set exists to withhold. The
 * section says so in plain words instead of offering a link that would be
 * either a lie or a leak.
 */

import { useCallback, useEffect, useState } from "react";
import { EyeOff, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";

/** What a sealed case is allowed to say about itself, and no more. */
export interface SealedCaseRow {
  id: string;
  label: string;
  licence: string | null;
  published: string | null;
  createdAt: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; rows: SealedCaseRow[] }
  | { status: "error"; message: string };

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function fetchSealedCases(
  rulebookId: string,
): Promise<SealedCaseRow[]> {
  const rows = (await readAllRows(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("masterwork_corpus_item")
        // label / source_meta only — the narrative, the unfolded steps and the
        // resolution are deliberately NOT selected.
        .select("id,label,source_meta,created_at", { count: "exact" })
        .eq("rulebook_id", rulebookId)
        .eq("kind", "timeline")
        .eq("metadata->>role", "heldout")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "platform.masterwork_corpus_item held-out cases" },
  )) as Array<{
    id: string;
    label: string | null;
    source_meta: unknown;
    created_at: string;
  }>;
  return rows.map((row) => {
    const meta =
      row.source_meta && typeof row.source_meta === "object" && !Array.isArray(row.source_meta)
        ? (row.source_meta as Record<string, unknown>)
        : {};
    return {
      id: String(row.id),
      label: textOf(row.label) ?? "Untitled case",
      licence: textOf(meta.licence),
      published: textOf(meta.published),
      createdAt: String(row.created_at),
    };
  });
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HeldOutCasesSection({ rulebookId }: { rulebookId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", rows: await fetchSealedCases(rulebookId) });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not read your held-out cases",
      });
    }
  }, [rulebookId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Nothing sealed yet and nothing wrong: this section has nothing to say, so
  // it says nothing rather than occupying the page with an empty shell.
  if (state.status === "ready" && state.rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <EyeOff className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">
          Held-out cases
          {state.status === "ready" ? ` (${state.rows.length})` : ""}
        </h3>
        {state.status === "loading" ? <LoadingSpinner size="sm" /> : null}
        {/* A case sealed from the dialog on this same page lands in the
            database, not in this component's state — so the list carries its
            own reload rather than silently going stale. */}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs text-muted-foreground"
          onClick={() => void load()}
          disabled={state.status === "loading"}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Sealed. Your system is examined on these and never learns from them — no
        rules come from them, and how each one turned out is not shown here.
      </p>

      {state.status === "error" ? (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          <p>{state.message}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7"
            onClick={() => void load()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border/70">
          {state.rows.map((row) => {
            const published = formatDate(row.published) ?? formatDate(row.createdAt);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2.5 py-2"
              >
                <span className="text-sm text-foreground">{row.label}</span>
                {published ? (
                  <span className="text-xs text-muted-foreground">
                    · {published}
                  </span>
                ) : null}
                {row.licence ? (
                  <span className="text-xs text-muted-foreground">
                    · {row.licence}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
