"use client";

/**
 * "Reset to pack" — P13's re-apply button, the half that overwrites.
 *
 * Ruling (Arman, 2026-08-22): two buttons — "Fill what's missing" never touches
 * your rows; "Reset to pack" does, AFTER listing exactly what changes — and
 * every bulk control has an individual AND an all. So this dialog lists only
 * the items that would actually change (changed · archived), each with the
 * pack's value beside yours, each with its own checkbox, with select all /
 * none, and the confirm button names the count. Nothing is reset that the
 * person did not tick. Places on a service area are never reset (the pack
 * never carried them) — the dialog says so on geo rows.
 *
 * One write path: `adopt_starter_pack(..., p_reset=true, p_item_ids /
 * p_rule_ids)`; the site's own rows (state `yours`) are not even offered.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/styles/themes/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { adoptStarterPack } from "../data";
import { humanizeSlug } from "../lib";
import type {
  StarterPackPart,
  StarterPackSiteStatus,
  StarterPackStatusItem,
} from "../types";

const KIND_LABEL: Record<string, string> = {
  rule: "Rule",
  value_band: "Value band",
  geo_band: "Geo band",
  geo_area: "Service area",
  topic: "Offering worth",
};

/** One line each: what the pack says vs what the site has. */
function itemDelta(item: StarterPackStatusItem): { pack: string; site: string } {
  const p = item.pack;
  const s = item.site ?? {};
  switch (item.kind) {
    case "rule":
      return {
        pack: `×${String(p.value_multiplier ?? 1)}${p.pattern ? ` · “${String(p.pattern)}”` : ""}${p.match_facet ? ` · ${humanizeSlug(String(p.match_facet))}` : ""}`,
        site:
          item.state === "archived"
            ? "archived"
            : `×${String(s.value_multiplier ?? 1)}${s.pattern ? ` · “${String(s.pattern)}”` : ""}${s.match_facet ? ` · ${humanizeSlug(String(s.match_facet))}` : ""}`,
      };
    case "value_band": {
      const pc = (p.config ?? {}) as Record<string, unknown>;
      const sc = (s.config ?? {}) as Record<string, unknown>;
      return {
        pack: `${String(p.label ?? "")}${pc.min_score !== undefined ? ` · from ${String(pc.min_score)}` : ""}`,
        site:
          item.state === "archived"
            ? "archived"
            : `${String(s.label ?? "")}${sc.min_score !== undefined ? ` · from ${String(sc.min_score)}` : ""}`,
      };
    }
    case "geo_band": {
      const pc = (p.config ?? {}) as Record<string, unknown>;
      const sc = (s.config ?? {}) as Record<string, unknown>;
      return {
        pack: `${String(p.label ?? "")} · ×${String(pc.multiplier ?? 1)}`,
        site:
          item.state === "archived"
            ? "archived"
            : `${String(s.label ?? "")} · ×${String(sc.multiplier ?? 1)}`,
      };
    }
    case "geo_area":
      return {
        pack: `${humanizeSlug(String(p.geo_band ?? ""))} · ${humanizeSlug(String(p.area_kind ?? "city"))} (your places stay)`,
        site:
          item.state === "archived"
            ? "archived"
            : `${humanizeSlug(String(s.geo_band ?? ""))} · ${humanizeSlug(String(s.area_kind ?? ""))}`,
      };
    case "topic":
      return {
        pack: `weight ${String(p.weight ?? "—")}${p.offering_match ? ` · ${humanizeSlug(String(p.offering_match))}` : ""}${p.lead_quality ? ` · ${humanizeSlug(String(p.lead_quality))}` : ""}`,
        site:
          item.state === "archived"
            ? "archived"
            : `weight ${String(s.weight ?? "—")}${s.offering_match ? ` · ${humanizeSlug(String(s.offering_match))}` : ""}${s.lead_quality ? ` · ${humanizeSlug(String(s.lead_quality))}` : ""}`,
      };
    default:
      return { pack: "", site: "" };
  }
}

export function ResetToPackDialog({
  siteId,
  packName,
  status,
  onClose,
}: {
  siteId: string;
  packName: string;
  status: StarterPackSiteStatus;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const candidates = status.items.filter(
    (item) => item.state === "changed" || item.state === "archived",
  );
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(candidates.map((c) => `${c.kind}:${c.ref}`)),
  );

  const allOn = candidates.length > 0 && ticked.size === candidates.length;
  const toggleAll = () =>
    setTicked(allOn ? new Set() : new Set(candidates.map((c) => `${c.kind}:${c.ref}`)));

  const reset = useMutation({
    mutationFn: async () => {
      const itemIds = candidates
        .filter((c) => ticked.has(`${c.kind}:${c.ref}`))
        .map((c) => c.ref);
      // Touch only the PARTS that carry a ticked item, and inside each part
      // only the ticked identities — an unticked kind is never visited.
      const partOf: Record<string, StarterPackPart> = {
        meaning: "meaning",
        value_band: "value_bands",
        geo_band: "geo_bands",
        geo_area: "geo_areas",
        topic: "topics",
      };
      const parts = Array.from(
        new Set(
          candidates
            .filter((c) => ticked.has(`${c.kind}:${c.ref}`))
            .map((c) => partOf[c.kind]),
        ),
      );
      return adoptStarterPack(siteId, status.pack_id, {
        reset: true,
        parts,
        ...(itemIds.length ? { itemIds } : {}),
        seedGuidelines: false,
      });
    },
    onSuccess: (result) => {
      const n =
        result.reset_meaning +
        result.reset_topics +
        result.reset_value_bands +
        result.reset_geo_bands +
        result.reset_geo_areas;
      toast.success(
        n === 0
          ? "Nothing needed resetting."
          : `Reset ${n} item${n === 1 ? "" : "s"} to what ${packName} proposes.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["seo"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing"] });
      onClose();
    },
    onError: (error) => toast.error(`Could not reset: ${extractErrorMessage(error)}`),
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Reset to ${packName}?`}
      description={
        candidates.length === 0
          ? "Everything you adopted from this pack still says exactly what the pack says — there is nothing to reset."
          : "Only the items below would change. Your own rules, areas and bands are not touched, and the places on a service area always stay yours. Untick anything you want to keep."
      }
      contentClassName="sm:max-w-2xl"
      confirmLabel={
        ticked.size === 0
          ? "Nothing ticked"
          : `Reset ${ticked.size} of ${candidates.length}`
      }
      confirmDisabled={ticked.size === 0}
      variant="destructive"
      busy={reset.isPending}
      onConfirm={() => reset.mutate()}
      content={
        candidates.length === 0 ? null : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                <Checkbox checked={allOn} onCheckedChange={toggleAll} aria-label="Select all" />
                {allOn ? "All selected" : "Select all"}
              </label>
              <span className="text-[11px] text-muted-foreground">
                {ticked.size} of {candidates.length}
              </span>
            </div>
            <ul className="max-h-[50dvh] space-y-1 overflow-y-auto overscroll-contain scrollbar-thin">
              {candidates.map((item) => {
                const key = `${item.kind}:${item.ref}`;
                const on = ticked.has(key);
                const delta = itemDelta(item);
                return (
                  <li key={key}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
                        on ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                      )}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() =>
                          setTicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        className="mt-0.5"
                        aria-label={item.label}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {item.label}
                          </span>
                          <span className="rounded border border-border bg-muted/40 px-1 py-px text-[10px] text-muted-foreground">
                            {KIND_LABEL[item.kind] ?? item.kind}
                          </span>
                        </span>
                        <span className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 text-[11px] leading-4">
                          <span className="text-muted-foreground">you have</span>
                          <span className="text-foreground">{delta.site}</span>
                          <span className="text-muted-foreground">pack says</span>
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <RotateCcw className="h-3 w-3 text-primary" aria-hidden />
                            {delta.pack}
                          </span>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      }
    />
  );
}
