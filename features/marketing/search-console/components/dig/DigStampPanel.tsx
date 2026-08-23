"use client";

/**
 * "Save matches as a stamp" — the C5 seam between Dig Here and the stamp
 * system.
 *
 * ARMAN'S WORDS (VISION.md): "ten thousand words getting impressions, five
 * thousand have one or fewer impressions — why can't I just put a category on
 * those so they instantly have a place they belong." A dig rule already FINDS
 * that set every time it runs. This panel lets the set keep a NAME.
 *
 * THE MODEL (P19–P22). The rule becomes ONE matcher of kind `condition` on a
 * SITUATIONAL value; the engine stamps what the rule finds over the site's
 * current window, with an as-of, and removes the stamps that stop matching.
 * Nothing here re-implements the rule — evaluation runs the identical
 * `gsc_perf_dig` path the results table above is showing.
 *
 * P21 — a stamp is a SEGMENT, never a to-do. "Parked" describes where a
 * keyword sits; it is not a status somebody closes. If a flow needs "done",
 * that is a task pointing at the stamp, and it does not live here.
 */

import { useState } from "react";
import {
  BrainCircuit,
  Check,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractErrorMessage } from "@/utils/errors";
import { formatRelativeTime } from "@/utils/datetime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFacetDimensionCatalog,
  toIdentitySlug,
  upsertFacetDimension,
  upsertFacetValue,
  type FacetDimension,
} from "@/features/marketing/seo/value-system/dimensions/data";
import {
  useDigRuleStamps,
  useDigStampMutations,
} from "@/features/marketing/search-console/hooks/useDigRules";

const NEW = "__new__";

/** "as of 2 hours ago" — a situational stamp never renders without its time. */
export function AsOfLabel({ value }: { value: string | null }) {
  if (!value) {
    return (
      <span className="text-[11px] text-warning">never evaluated</span>
    );
  }
  return (
    <span
      className="text-[11px] text-muted-foreground"
      title={new Date(value).toLocaleString()}
    >
      as of {formatRelativeTime(value, { style: "long" })}
    </span>
  );
}

export function DigStampPanel({
  siteId,
  ruleId,
  ruleName,
  /** A page rule with no class/level pin finds pages, not keywords. */
  canStamp,
  /** The rule's own row limit — the ceiling on how much it can ever stamp. */
  rowLimit,
}: {
  siteId: string;
  ruleId: string | null;
  ruleName: string;
  canStamp: boolean;
  rowLimit: number;
}) {
  const queryClient = useQueryClient();
  const stamps = useDigRuleStamps(siteId, ruleId);
  const mutations = useDigStampMutations(siteId);
  const [adding, setAdding] = useState(false);
  const [dimensionId, setDimensionId] = useState<string>("");
  const [valueId, setValueId] = useState<string>("");
  const [newDimensionLabel, setNewDimensionLabel] = useState("");
  const [newValueLabel, setNewValueLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const catalogKey = ["marketing", "seo", "facet-dimensions", siteId];
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId, signal),
    enabled: adding,
    staleTime: 60_000,
  });

  // Only THIS site's situational dimensions can hold a rule's matches: a
  // platform dimension is a fact every tenant shares, and an intrinsic one
  // describes the words rather than what is happening to them.
  const situational: FacetDimension[] = (catalog.data ?? []).filter(
    (d) => d.scope === "site" && d.nature === "situational",
  );
  const chosen = situational.find((d) => d.dimension_id === dimensionId) ?? null;

  const rows = stamps.data ?? [];

  const reset = () => {
    setAdding(false);
    setDimensionId("");
    setValueId("");
    setNewDimensionLabel("");
    setNewValueLabel("");
  };

  const save = async () => {
    if (!ruleId) return;
    setSaving(true);
    try {
      // Create-on-the-way-through: a person naming a segment should never have
      // to visit another screen first. Both writes are the SAME governed RPCs
      // the dimensions editor uses — no second creation path exists.
      let dimensionSlug = chosen?.slug ?? "";
      if (dimensionId === NEW) {
        const label = newDimensionLabel.trim();
        if (!label) throw new Error("Name the group these segments belong to.");
        dimensionSlug = toIdentitySlug(label);
        await upsertFacetDimension({
          slug: dimensionSlug,
          label,
          description: null,
          cardinality: "multi",
          nature: "situational",
          siteId,
        });
      }
      let targetValueId = valueId;
      if (valueId === NEW || dimensionId === NEW) {
        const label = newValueLabel.trim();
        if (!label) throw new Error("Name the segment these keywords land in.");
        targetValueId = await upsertFacetValue({
          dimension: dimensionSlug,
          value: toIdentitySlug(label),
          label,
          description: `Filled by the Dig Here rule “${ruleName}”.`,
          siteId,
        });
      }
      if (!targetValueId) throw new Error("Pick the segment to fill.");

      const matcherId = await mutations.save.mutateAsync({
        ruleId,
        valueId: targetValueId,
      });
      void queryClient.invalidateQueries({ queryKey: catalogKey });
      // Saving without evaluating would leave a segment that names nothing.
      const result = await mutations.evaluate.mutateAsync({ matcherId });
      const first = result.results[0];
      toast.success(
        `Saved — ${result.stamped.toLocaleString()} keyword${result.stamped === 1 ? "" : "s"} stamped.` +
          (first?.limited
            ? ` ${first.matched_total?.toLocaleString()} matched — raise the rule's row limit to cover them all.`
            : ""),
      );
      reset();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const reevaluate = async (matcherId: string, label: string) => {
    try {
      const result = await mutations.evaluate.mutateAsync({ matcherId });
      const detail = result.results[0];
      toast.success(
        `${label}: ${(detail?.stamped ?? 0).toLocaleString()} stamped, ${(detail?.removed ?? 0).toLocaleString()} released (${result.window.start} → ${result.window.end}).` +
          (detail?.limited
            ? ` Only ${detail.matched?.toLocaleString()} of ${detail.matched_total?.toLocaleString()} fit this rule's row limit.`
            : ""),
      );
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const detach = async (matcherId: string, label: string) => {
    const ok = await confirm({
      title: `Stop filling “${label}”?`,
      description:
        "The keywords this rule stamped lose the segment. Anything you stamped by hand keeps it.",
      variant: "destructive",
      confirmLabel: "Stop filling",
    });
    if (!ok) return;
    try {
      const result = await mutations.remove.mutateAsync(matcherId);
      toast.success(
        `Removed — ${result.stamps_removed.toLocaleString()} stamp${result.stamps_removed === 1 ? "" : "s"} released.`,
      );
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  if (!ruleId) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-card px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Tag className="h-3 w-3" />
          Saves matches as
        </span>
        {rows.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">
            nothing yet — these matches are a list, not a segment
          </span>
        ) : null}
        {rows.map((row) => (
          <span
            key={row.matcher_id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pl-2 pr-1 text-[11px]"
          >
            <span className="font-medium text-foreground">
              {row.dimension_label}: {row.value_label}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {row.stamp_count.toLocaleString()} kw
            </span>
            <AsOfLabel value={row.as_of ?? row.last_evaluated_at} />
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
              aria-label={`Re-evaluate ${row.value_label}`}
              title="Re-evaluate now"
              disabled={mutations.evaluate.isPending}
              onClick={() => void reevaluate(row.matcher_id, row.value_label)}
            >
              <RefreshCw
                className={
                  mutations.evaluate.isPending
                    ? "h-3 w-3 animate-spin"
                    : "h-3 w-3"
                }
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              aria-label={`Stop filling ${row.value_label}`}
              onClick={() => void detach(row.matcher_id, row.value_label)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </span>
        ))}
        {!adding && canStamp ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" />
            Save matches as a stamp
          </Button>
        ) : null}
      </div>

      {/* C5b — NO SILENT CAPS. A rule stamps exactly what its results table
          shows, so a segment sitting on the rule's row limit is a truncation
          and says so where the number is, not only in a toast that scrolled
          away. Raising the limit is one click away in the rule editor. */}
      {rows.some((row) => row.stamp_count >= rowLimit) ? (
        <p className="text-[11px] text-warning">
          This rule stamps at most {rowLimit.toLocaleString()} keywords — its
          row limit — and it is holding that many. There are almost certainly
          more that match. Edit the rule and raise its row limit (up to 1,000)
          to cover them, or tighten the conditions so the segment means
          something narrower.
        </p>
      ) : null}

      {!canStamp ? (
        <p className="text-[11px] text-muted-foreground">
          This rule digs pages, so its matches are pages. A stamp lands on a
          keyword — switch it to Queries, or pin it to a class or level, to save
          what it finds.
        </p>
      ) : null}

      {adding ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
          <p className="text-[11px] text-muted-foreground">
            Every keyword this rule finds gets stamped with the segment you
            pick, with the time it was worked out. Re-evaluate and the stamp
            follows the data — keywords that stop matching let it go.
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Select
              value={dimensionId}
              onValueChange={(next) => {
                setDimensionId(next);
                setValueId(next === NEW ? NEW : "");
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-full text-xs"
                aria-label="Segment group"
              >
                <SelectValue
                  placeholder={
                    catalog.isPending ? "Loading…" : "Which group of segments?"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {situational.map((dimension) => (
                  <SelectItem
                    key={dimension.dimension_id}
                    value={dimension.dimension_id}
                    className="text-xs"
                  >
                    {dimension.label}
                  </SelectItem>
                ))}
                <SelectItem value={NEW} className="text-xs">
                  New group of segments…
                </SelectItem>
              </SelectContent>
            </Select>

            {dimensionId === NEW ? (
              <Input
                value={newDimensionLabel}
                onChange={(e) => setNewDimensionLabel(e.target.value)}
                placeholder="Group name, e.g. Attention"
                className="h-7 text-xs"
                aria-label="New segment group name"
              />
            ) : chosen ? (
              <Select value={valueId} onValueChange={setValueId}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-full text-xs"
                  aria-label="Segment"
                >
                  <SelectValue placeholder="Which segment?" />
                </SelectTrigger>
                <SelectContent>
                  {chosen.values.map((value) => (
                    <SelectItem
                      key={value.value_id}
                      value={value.value_id}
                      className="text-xs"
                    >
                      {value.label}
                      {value.keyword_count > 0
                        ? ` · ${value.keyword_count.toLocaleString()} kw`
                        : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW} className="text-xs">
                    New segment…
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {dimensionId === NEW || valueId === NEW ? (
            <Input
              value={newValueLabel}
              onChange={(e) => setNewValueLabel(e.target.value)}
              placeholder="Segment name, e.g. Parked (≤1 impression)"
              className="h-7 text-xs"
              aria-label="New segment name"
            />
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <BrainCircuit className="h-3 w-3" />
              A segment says where a keyword sits — never a task somebody
              closes.
            </span>
            <span className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={reset}
                disabled={saving}
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => void save()}
                disabled={saving || !dimensionId}
              >
                <Check className="h-3 w-3" />
                {saving ? "Saving…" : "Save and evaluate"}
              </Button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
