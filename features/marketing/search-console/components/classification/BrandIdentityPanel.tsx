"use client";

/**
 * Brand identity panel — narrates the brand_match rung from SERVER state
 * (`seo.gsc_brand_identity`): every alias the resolver derives (domain /
 * site name / brand name) plus the custom list, with corpus match counts
 * and the genericity demotion explained in place. Custom aliases (key
 * people, legal names, DBAs, misspellings) are edited here and stored on
 * `web.brand.profile.brand_aliases` via `seo.gsc_set_brand_aliases` — the
 * intake wizard's accepted proposals land on the SAME array.
 *
 * The add-alias input is a live server preview through the SAME canonical
 * brand matcher used by classification. It reports only current-window
 * keywords not already covered by the site's existing identity. Every alias
 * row's match count is a door (`onInspectAlias`) — it filters the keyword
 * table behind this panel with that exact saved-alias matcher.
 *
 * Never re-derives aliases or match logic client-side — the resolver in
 * `migrations/seo_gsc_class_rpcs.sql` is the single source.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Fingerprint,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getGscBrandAliasPreview,
  getGscBrandIdentity,
  setGscBrandAliases,
  type GscBrandIdentityRow,
} from "@/features/marketing/search-console/data-classification";
import type { GscDateRange } from "@/features/marketing/search-console/types";
import { formatCount } from "@/features/marketing/search-console/types";

const SOURCE_LABELS: Record<string, string> = {
  domain: "Domain",
  site_name: "Site name",
  brand_name: "Brand name",
  custom: "Custom",
};

export function BrandIdentityPanel({
  siteId,
  range,
  onChanged,
  onInspectAlias,
}: {
  siteId: string;
  /** Review window for the live match preview (same window as the table). */
  range: GscDateRange;
  /** Called after the custom alias list changes — invalidate class reads. */
  onChanged: () => void;
  /** A count is a door — filter the keyword table behind to this alias. */
  onInspectAlias?: (alias: string) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(draft.trim()), 250);
    return () => window.clearTimeout(t);
  }, [draft]);

  const identity = useQuery({
    queryKey: ["gsc-brand-identity", siteId],
    queryFn: ({ signal }) => getGscBrandIdentity(siteId, signal),
  });

  const rows = identity.data ?? [];
  const customAliases = useMemo(
    () => rows.filter((r) => r.alias_source === "custom").map((r) => r.alias),
    [rows],
  );
  const allAliases = useMemo(() => rows.map((r) => r.alias), [rows]);

  // Live preview through the canonical brand matcher. The server removes
  // keywords already covered by the site's current identity.
  const previewEnabled = debounced.length >= 2;
  const matchPreview = useQuery({
    queryKey: [
      "gsc-brand-alias-preview",
      siteId,
      range.start,
      range.end,
      debounced,
    ],
    enabled: previewEnabled,
    queryFn: ({ signal }) =>
      getGscBrandAliasPreview(siteId, debounced, range, signal),
    staleTime: 60_000,
  });
  const aliasPreview = matchPreview.data;
  const suggestions = previewEnabled ? (aliasPreview?.matches ?? []) : [];
  const aliasAlreadyCovered =
    allAliases.includes(draft.trim().toLowerCase()) ||
    aliasPreview?.alias_exists === true;

  const save = useMutation({
    mutationFn: (aliases: string[]) => setGscBrandAliases(siteId, aliases),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({
        queryKey: ["gsc-brand-identity", siteId],
      });
      onChanged();
    },
    onError: (error) =>
      toast.error("Could not save brand aliases", {
        description: extractErrorMessage(error),
      }),
  });

  const addAlias = (raw?: string) => {
    const value = (raw ?? draft).trim().toLowerCase();
    if (!value) return;
    if (allAliases.includes(value)) {
      toast.info("That alias is already covered", {
        description: customAliases.includes(value)
          ? "It is on the custom list."
          : "It is already derived from the domain, site name, or brand name.",
      });
      return;
    }
    save.mutate([...customAliases, value]);
  };
  const columns: MatrxColumnDef<GscBrandIdentityRow>[] = [
    {
      id: "alias",
      accessorKey: "alias",
      header: "Alias",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <Fingerprint className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-medium">{row.alias}</span>
          {row.demoted ? (
            <span
              className="rounded border border-warning/60 bg-warning/10 px-1 py-px text-[10px] font-medium text-warning"
              title="Matches too much of the corpus to be distinctive — only exact unspaced / legal-suffix forms count as brand."
            >
              Generic
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "alias_source",
      accessorKey: "alias_source",
      header: "Source",
      filter: "select",
      cell: (row) => SOURCE_LABELS[row.alias_source] ?? row.alias_source,
    },
    {
      id: "matched_keywords",
      accessorKey: "matched_keywords",
      header: "Matches",
      filter: "number",
      align: "right",
      cell: (row) => {
        const label = row.demoted
          ? `${row.strong_matches} of ${row.matched_keywords}`
          : String(row.matched_keywords);
        const title = `${row.matched_keywords} matching keywords in the corpus (${row.strong_matches} exact-form)`;
        return onInspectAlias && row.matched_keywords > 0 ? (
          <button
            type="button"
            className="rounded px-1 py-0.5 underline decoration-dotted underline-offset-2 transition-colors hover:bg-accent hover:text-primary"
            title={`${title} — show them in the keyword table`}
            onClick={() => onInspectAlias(row.alias)}
          >
            {label}
          </button>
        ) : (
          <span title={title}>{label}</span>
        );
      },
    },
    {
      id: "demoted",
      accessorKey: "demoted",
      header: "Generic",
      filter: "boolean",
      cell: (row) => (row.demoted ? "Yes" : "No"),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-2">
      <p className="text-xs leading-snug text-muted-foreground">
        Queries matching these aliases classify as{" "}
        <span className="font-medium text-foreground">brand</span> — branded
        traffic is not real SEO and is pulled out of money and educational
        numbers. Domain, site name, and brand name are derived automatically;
        add the rest here: key people, legal names, DBAs, common misspellings.
        An alias is not exact-only: it covers queries containing its joined name
        or all of its words.
      </p>

      {identity.isError ? (
        <InlineQueryError
          what="Brand identity"
          error={identity.error}
          onRetry={() => void identity.refetch()}
        />
      ) : null}

      <div className="overflow-hidden rounded-md border border-border p-2">
        <MatrxDataTable
          urlState={{ id: "brand-identity" }}
          data={rows}
          columns={columns}
          getRowId={(row) => `${row.alias_source}:${row.alias}`}
          isLoading={identity.isLoading}
          pageSize={10}
          pageSizeOptions={[10, 25, 50, 100]}
          emptyState={{
            title: "No brand identity",
            description: "The site needs a domain, name, or linked brand.",
          }}
          rowActions={(row) =>
            row.alias_source === "custom" ? (
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                title={`Remove ${row.alias}`}
                aria-label={`Remove ${row.alias}`}
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    customAliases.filter((alias) => alias !== row.alias),
                  )
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null
          }
        />
      </div>

      <div className="shrink-0">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            addAlias();
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft("");
              }
            }}
            placeholder='Add an alias — "dr angie sadeghi", "armani sadeghi"…'
            className="h-8 text-xs"
            disabled={save.isPending}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2 text-xs"
            disabled={save.isPending || !draft.trim() || aliasAlreadyCovered}
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </Button>
        </form>

        {previewEnabled ? (
          <div className="mt-1.5 overflow-hidden rounded-md border border-border bg-muted/20">
            <p className="flex items-center gap-1.5 border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
              {matchPreview.isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Search className="h-3 w-3" />
              )}
              {matchPreview.isError ? (
                <span className="text-destructive">
                  Match preview failed —{" "}
                  {extractErrorMessage(matchPreview.error)}
                </span>
              ) : matchPreview.isFetching && !aliasPreview ? (
                <span>Checking the real brand matcher…</span>
              ) : aliasPreview && !aliasPreview.eligible ? (
                <span>
                  Use at least five letters or numbers after punctuation and
                  generic company words are removed.
                </span>
              ) : aliasPreview?.alias_exists ? (
                <span>
                  <span className="font-medium text-foreground">
                    Already covered.
                  </span>{" "}
                  {formatCount(aliasPreview.active_matches)} active keyword
                  {aliasPreview.active_matches === 1 ? "" : "s"} already match
                  this alias; there are no new matches to add.
                </span>
              ) : aliasPreview ? (
                <span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCount(aliasPreview.new_matches)} new
                  </span>{" "}
                  active keyword{aliasPreview.new_matches === 1 ? "" : "s"}{" "}
                  would classify as brand.{" "}
                  {aliasPreview.active_matches - aliasPreview.new_matches > 0
                    ? [
                        formatCount(
                          aliasPreview.active_matches -
                            aliasPreview.new_matches,
                        ),
                        " already covered · ",
                      ].join("")
                    : ""}
                  {formatCount(aliasPreview.corpus_matches)} total corpus match
                  {aliasPreview.corpus_matches === 1 ? "" : "es"}.
                </span>
              ) : (
                <span>Checking matches…</span>
              )}
            </p>
            {suggestions.length > 0 ? (
              <ul className="max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={s.keyword_id}>
                    <div className="flex items-center gap-2 px-2 py-1 text-xs">
                      <span className="min-w-0 flex-1 truncate">{s.query}</span>
                      <span
                        className="shrink-0 tabular-nums text-[10px] text-muted-foreground"
                        title={`${formatCount(s.impressions)} impressions in the review window`}
                      >
                        {formatCount(s.impressions)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        <ShieldAlert className="mr-1 inline h-3 w-3 align-[-2px] text-warning" />
        <span className="font-medium text-foreground">Generic</span> marks an
        alias that matches so much of the keyword corpus it must be a service
        term, not just a name (e.g. “data destruction”). It then only counts
        exact forms — the domain typed as one word or the exact name plus
        inc/llc — so the brand rung cannot swallow the site&apos;s money
        vocabulary. Rule individual keywords in the table behind this panel; an
        explicit ruling always beats the brand match.
      </p>
    </div>
  );
}
