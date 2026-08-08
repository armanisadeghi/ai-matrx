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
 * Never re-derives aliases or match logic client-side — the resolver in
 * `migrations/seo_gsc_class_rpcs.sql` is the single source.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getGscBrandIdentity,
  setGscBrandAliases,
  type GscBrandIdentityRow,
} from "@/features/marketing/search-console/data-classification";

const SOURCE_LABELS: Record<string, string> = {
  domain: "Domain",
  site_name: "Site name",
  brand_name: "Brand name",
  custom: "Custom",
};

export function BrandIdentityPanel({
  siteId,
  onChanged,
}: {
  siteId: string;
  /** Called after the custom alias list changes — invalidate class reads. */
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const identity = useQuery({
    queryKey: ["gsc-brand-identity", siteId],
    queryFn: ({ signal }) => getGscBrandIdentity(siteId, signal),
  });

  const rows = identity.data ?? [];
  const customAliases = useMemo(
    () => rows.filter((r) => r.alias_source === "custom").map((r) => r.alias),
    [rows],
  );

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

  const addAlias = () => {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (customAliases.includes(value)) {
      toast.info("That alias is already on the list");
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
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-2 py-1.5 font-medium">Alias</th>
              <th className="px-2 py-1.5 font-medium">Source</th>
              <th className="px-2 py-1.5 text-right font-medium" title="Corpus keywords this alias matches">
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
                  onRemove={() =>
                    save.mutate(customAliases.filter((a) => a !== row.alias))
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <form
        className="flex shrink-0 items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          addAlias();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder='Add an alias — "dr angie sadeghi", "armani sadeghi"…'
          className="h-8 text-xs"
          disabled={save.isPending}
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
  onRemove,
}: {
  row: GscBrandIdentityRow;
  removable: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
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
        title={`${row.matched_keywords} matching keywords in the corpus (${row.strong_matches} exact-form)`}
      >
        {row.demoted
          ? `${row.strong_matches} of ${row.matched_keywords}`
          : row.matched_keywords}
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
