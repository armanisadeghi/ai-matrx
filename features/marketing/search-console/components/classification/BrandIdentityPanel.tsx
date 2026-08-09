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
 * The add-alias input is a live typeahead: a debounced server-side corpus
 * probe (`gsc_keyword_class_review` with pattern/contains — the SAME
 * matcher the rules preview uses) shows how many keywords the draft would
 * broad-match plus the top matches with the hit highlighted; clicking a
 * suggestion autofills the input. Every alias row's match count is a door
 * (`onInspectAlias`) — it filters the keyword table behind this panel.
 *
 * Never re-derives aliases or match logic client-side — the resolver in
 * `migrations/seo_gsc_class_rpcs.sql` is the single source.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Fingerprint, Loader2, Plus, Search, ShieldAlert, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getGscBrandIdentity,
  getGscClassReview,
  setGscBrandAliases,
  type GscBrandIdentityRow,
} from "@/features/marketing/search-console/data-classification";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";
import type { GscDateRange } from "@/features/marketing/search-console/types";
import { formatCount } from "@/features/marketing/search-console/types";

const SOURCE_LABELS: Record<string, string> = {
  domain: "Domain",
  site_name: "Site name",
  brand_name: "Brand name",
  custom: "Custom",
};

/** Render a keyword with the matched alias substring highlighted. */
function HighlightedMatch({ text, needle }: { text: string; needle: string }) {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0 || !needle) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 px-0 text-foreground">
        {text.slice(idx, idx + needle.length)}
      </mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

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
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Live broad-match preview: the server-side contains matcher over the
  // corpus — the same code path the pattern-rule preview pipes through.
  const previewEnabled = debounced.length >= 2;
  const matchPreview = useQuery({
    queryKey: ["gsc-brand-alias-preview", siteId, debounced],
    enabled: previewEnabled,
    queryFn: ({ signal }) =>
      getGscClassReview(
        siteId,
        range,
        {
          trafficClasses: null,
          sources: null,
          search: "",
          sort: "impressions",
          sortDir: "desc",
          page: 1,
          pageSize: 8,
          pattern: debounced,
          matchKind: "contains",
          confirmed: null,
        },
        signal,
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const suggestions = previewEnabled ? (matchPreview.data?.rows ?? []) : [];
  const previewTotal = matchPreview.data?.total ?? 0;

  useEffect(() => setActiveIndex(-1), [debounced]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-2">
      <p className="text-xs leading-snug text-muted-foreground">
        Queries matching these aliases classify as{" "}
        <span className="font-medium text-foreground">brand</span> — branded
        traffic is not real SEO and is pulled out of money and educational
        numbers. Domain, site name, and brand name are derived automatically;
        add the rest here: key people, legal names, DBAs, common
        misspellings.
      </p>

      {identity.isError ? (
        <InlineQueryError
          what="Brand identity"
          error={identity.error}
          onRetry={() => void identity.refetch()}
        />
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-2 py-1.5 font-medium">Alias</th>
              <th className="px-2 py-1.5 font-medium">Source</th>
              <th className="px-2 py-1.5 text-right font-medium" title="Corpus keywords this alias matches — click a count to see those keywords in the table">
                Matches
              </th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {identity.isLoading ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                  No brand identity — the site needs a domain, name, or
                  linked brand.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <BrandAliasRow
                  key={`${row.alias_source}:${row.alias}`}
                  row={row}
                  removable={row.alias_source === "custom"}
                  removing={save.isPending}
                  onInspect={onInspectAlias}
                  onRemove={() =>
                    save.mutate(customAliases.filter((a) => a !== row.alias))
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (activeIndex >= 0 && suggestions[activeIndex]) {
              addAlias(suggestions[activeIndex].query);
            } else {
              addAlias();
            }
          }}
        >
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, -1));
              } else if (event.key === "Escape") {
                setActiveIndex(-1);
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
            disabled={save.isPending || !draft.trim()}
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
                  Match preview failed — {extractErrorMessage(matchPreview.error)}
                </span>
              ) : (
                <>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCount(previewTotal)}
                  </span>
                  keyword{previewTotal === 1 ? "" : "s"} contain{previewTotal === 1 ? "s" : ""}{" "}
                  <span className="font-medium text-foreground">“{debounced}”</span>
                  {previewTotal > 0
                    ? " — pick one to complete, or add your text as-is"
                    : " — it will only catch future queries"}
                </>
              )}
            </p>
            {suggestions.length > 0 ? (
              <ul className="max-h-48 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <li key={s.keyword_id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent",
                        i === activeIndex && "bg-accent",
                      )}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => {
                        setDraft(s.query);
                        inputRef.current?.focus();
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <HighlightedMatch text={s.query} needle={debounced} />
                      </span>
                      <span
                        className="shrink-0 tabular-nums text-[10px] text-muted-foreground"
                        title={`${formatCount(s.impressions)} impressions in the review window`}
                      >
                        {formatCount(s.impressions)}
                      </span>
                    </button>
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
        vocabulary. Rule individual keywords in the table behind this panel;
        an explicit ruling always beats the brand match.
      </p>
    </div>
  );
}

function BrandAliasRow({
  row,
  removable,
  removing,
  onInspect,
  onRemove,
}: {
  row: GscBrandIdentityRow;
  removable: boolean;
  removing: boolean;
  onInspect?: (alias: string) => void;
  onRemove: () => void;
}) {
  const countLabel = row.demoted
    ? `${row.strong_matches} of ${row.matched_keywords}`
    : String(row.matched_keywords);
  const countTitle = `${row.matched_keywords} matching keywords in the corpus (${row.strong_matches} exact-form)`;
  return (
    <tr className="border-t border-border">
      <td className="px-2 py-1.5">
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
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">
        {SOURCE_LABELS[row.alias_source] ?? row.alias_source}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right tabular-nums",
          row.matched_keywords === 0 && "text-muted-foreground",
        )}
      >
        {onInspect && row.matched_keywords > 0 ? (
          <button
            type="button"
            className="rounded px-1 py-0.5 underline decoration-dotted underline-offset-2 transition-colors hover:bg-accent hover:text-primary"
            title={`${countTitle} — show them in the keyword table`}
            onClick={() => onInspect(row.alias)}
          >
            {countLabel}
          </button>
        ) : (
          <span title={countTitle}>{countLabel}</span>
        )}
      </td>
      <td className="px-1 py-1.5 text-right">
        {removable ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            title="Remove this alias"
            disabled={removing}
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
