"use client";

/**
 * ADOPTION ASKS FOR THE PLACES — the step that stops a pack from writing shells.
 *
 * A pack carries geo areas as ARCHETYPES with no place names in them, on
 * purpose: "a pack never carries somebody else's cities". That is right, and it
 * was also the defect — adoption wrote four labelled, banded areas that match no
 * keyword, so the ideal / acceptable / expansion / excluded model was a NO-OP on
 * every adopting site until somebody happened to notice. Measured 2026-08-22 on
 * datadestruction.com: all four areas, zero tokens, `inert` in meaning health.
 *
 * So adoption now asks BEFORE it writes. Skipping is allowed — a business that
 * does not know its radius yet should not be blocked from adopting the other 90%
 * of a pack — but a skipped area is stamped `metadata.places_pending` and both
 * this screen and the workbench put a persistent door in front of it. Unfinished
 * is a state we say out loud, never a state we hide.
 *
 * Prefill comes from `web.business_location` — the brand's OWN saved addresses,
 * the record this platform already keeps. We suggest, never assume: the towns a
 * business SERVES are not the towns it sits in, and only the expert knows that.
 *
 * REGEX SAFETY: every token here goes through the same `parseTokens` /
 * `unsafeTokens` pair the geo bench uses, and then through
 * `seo.site_geo_area_assert_tokens` at write time. THE REGEX WALL is the one
 * authority; this screen just refuses a round trip earlier, in the same words.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPinned, Plus, TriangleAlert } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { listBusinessLocations } from "@/features/marketing/data/service";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { parseTokens, unsafeTokens } from "../rules/types";
import type { StarterPackGeoAreaItem } from "../types";

/** What the caller hands to `adoptStarterPack` — pack item id → place names. */
export type GeoPlacesByItem = Record<string, string[]>;

/**
 * Suggestions drawn from the brand's saved locations. A locality is a real
 * place name; a region code ("CA") is offered separately and clearly labelled,
 * because a two-letter whole word behaves very differently in a search.
 */
function suggestionsFromLocations(
  locations: Array<{ locality: string | null; region: string | null }>,
): { cities: string[]; regions: string[] } {
  const cities = new Set<string>();
  const regions = new Set<string>();
  for (const location of locations) {
    const city = location.locality?.trim().toLowerCase();
    if (city) cities.add(city);
    const region = location.region?.trim().toLowerCase();
    if (region) regions.add(region);
  }
  return { cities: [...cities], regions: [...regions] };
}

function areaIssues(tokensText: string): string[] {
  const unsafe = unsafeTokens(parseTokens(tokensText));
  if (unsafe.length === 0) return [];
  return [
    `“${unsafe.join("”, “")}” cannot be used — a place name can only contain letters, numbers, spaces and ' - . / & _ , because each one becomes a whole-word search.`,
  ];
}

function AreaRow({
  area,
  value,
  onChange,
  suggestions,
}: {
  area: StarterPackGeoAreaItem;
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
}) {
  const tokens = parseTokens(value);
  const issues = areaIssues(value);
  const addSuggestion = (suggestion: string) => {
    if (tokens.includes(suggestion)) return;
    onChange(value.trim() ? `${value.replace(/[\s,]+$/, "")}, ${suggestion}` : suggestion);
  };

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{area.label}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {area.geo_band}
          </Badge>
          {tokens.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
              <TriangleAlert className="h-3 w-3" aria-hidden />
              no places — will match nothing
            </span>
          ) : (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {tokens.length} place{tokens.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      {area.notes ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{area.notes}</p>
      ) : null}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={"new jersey, newark, edison"}
        className="mt-2 text-xs"
        aria-label={`Place names for ${area.label}`}
      />
      {suggestions.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">From your locations:</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addSuggestion(suggestion)}
              disabled={tokens.includes(suggestion)}
              className={cn(
                "inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] transition-colors",
                tokens.includes(suggestion)
                  ? "bg-muted/40 text-muted-foreground"
                  : "bg-card text-foreground hover:bg-accent",
              )}
            >
              <Plus className="h-2.5 w-2.5" aria-hidden />
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {issues.map((issue) => (
        <p key={issue} className="mt-1.5 text-[11px] leading-4 text-warning">
          {issue}
        </p>
      ))}
    </li>
  );
}

export function GeoPlacesStep({
  packName,
  brandId,
  areas,
  busy,
  onCancel,
  onAdopt,
}: {
  packName: string;
  brandId: string | null | undefined;
  areas: StarterPackGeoAreaItem[];
  busy: boolean;
  onCancel: () => void;
  /** `places` is empty when the person deliberately skipped this step. */
  onAdopt: (places: GeoPlacesByItem) => void;
}) {
  const locations = useQuery({
    queryKey: ["marketing", "business-locations", brandId ?? "none"],
    queryFn: ({ signal }) => listBusinessLocations(brandId as string, signal),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });

  const suggestions = useMemo(
    () => suggestionsFromLocations(locations.data ?? []),
    [locations.data],
  );

  const ordered = useMemo(
    () => [...areas].sort((a, b) => a.sort - b.sort),
    [areas],
  );

  /**
   * Prefill the FIRST archetype — the pack's own primary/ideal area — with the
   * cities the brand actually has addresses in, and nothing else. The wider
   * bands are guesses nobody but the expert can make, so they start empty
   * rather than starting wrong.
   */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && locations.isSuccess && ordered.length > 0) {
    setPrefilled(true);
    if (suggestions.cities.length > 0) {
      setDraft({ [ordered[0].item_id]: suggestions.cities.join(", ") });
    }
  }

  const places: GeoPlacesByItem = {};
  let filledAreas = 0;
  let unsafeCount = 0;
  for (const area of ordered) {
    const tokens = parseTokens(draft[area.item_id] ?? "");
    unsafeCount += unsafeTokens(tokens).length;
    if (tokens.length > 0) {
      places[area.item_id] = tokens;
      filledAreas += 1;
    }
  }
  const pending = ordered.length - filledAreas;
  const blocked = unsafeCount > 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="flex max-h-[92dvh] w-[min(46rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-4 w-4 text-primary" aria-hidden />
            Where does this business actually work?
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {packName} brings the shape of a service area — the radius you want,
            the ones you will take, the ones you never will — but not the places,
            because those are yours. Fill them in now and location starts counting
            in every keyword&apos;s worth the moment you adopt. Leave one empty and
            it is a name with nothing in it: it matches no search and changes no
            number until you come back to it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
          {brandId && locations.isLoading ? (
            <Skeleton className="mb-3 h-10 rounded-md" />
          ) : null}
          {locations.isError ? (
            <div className="mb-3">
              <InlineQueryError
                what="your saved business locations"
                error={locations.error}
                onRetry={() => void locations.refetch()}
              />
            </div>
          ) : null}
          {locations.isSuccess && suggestions.cities.length === 0 ? (
            <p className="mb-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              This brand has no saved business locations to suggest from, so
              nothing is prefilled. Type the towns, cities, counties or states
              each area stands for — one per line or separated by commas.
            </p>
          ) : null}
          {suggestions.regions.length > 0 ? (
            <p className="mb-3 text-[11px] leading-4 text-muted-foreground">
              Your locations are also in{" "}
              <span className="font-medium text-foreground">
                {suggestions.regions.join(", ")}
              </span>{" "}
              — add a state only where you genuinely serve the whole of it, since
              every place name is matched as a whole word inside the search.
            </p>
          ) : null}

          <ul className="space-y-2">
            {ordered.map((area) => (
              <AreaRow
                key={area.item_id}
                area={area}
                value={draft[area.item_id] ?? ""}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, [area.item_id]: next }))
                }
                suggestions={suggestions.cities}
              />
            ))}
          </ul>
        </div>

        <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-border px-4 pt-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-4 text-muted-foreground">
            {blocked
              ? "Fix the place names above before adopting."
              : pending === 0
                ? "Every area has places — geography will count from the moment you adopt."
                : `${pending} of ${ordered.length} area${ordered.length === 1 ? "" : "s"} will be adopted with no places yet, and flagged until you add them.`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </Button>
            {filledAreas < ordered.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAdopt({})}
                disabled={busy}
                className="text-xs"
              >
                Skip — I&apos;ll add places later
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => onAdopt(places)}
              disabled={busy || blocked || filledAreas === 0}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Adopt with these places
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
