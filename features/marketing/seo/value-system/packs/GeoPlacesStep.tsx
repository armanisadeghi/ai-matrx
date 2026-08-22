"use client";

/**
 * ADOPTION ASKS FOR THE PLACES — the step that stops a pack from writing shells.
 *
 * A pack carries geo areas as ARCHETYPES with nothing in them, on purpose: "a
 * pack never carries somebody else's cities". That is right, and it was also
 * the defect — adoption wrote four labelled, banded areas that match no keyword,
 * so the ideal / acceptable / expansion / excluded model was a NO-OP on every
 * adopting site until somebody happened to notice. Measured 2026-08-22 on
 * datadestruction.com: all four areas empty, `inert` in meaning health.
 *
 * So adoption asks BEFORE it writes. Skipping is allowed — a business that does
 * not know its radius yet should not be blocked from adopting the other 90% of
 * a pack — but a skipped area is stamped `metadata.places_pending` and both the
 * packs screen and the geo bench put a persistent door in front of it.
 * Unfinished is a state we say out loud, never one we hide.
 *
 * PLACES BEFORE WORDS (I3). The picker names rows from the platform gazetteer,
 * which carry what a typed string cannot — the state that disambiguates them,
 * their aliases, and whether the name is also an ordinary English word. Typed
 * words stay underneath for the neighbourhood or nickname the gazetteer has
 * never heard of, and go through the same `parseTokens` / `unsafeTokens` pair
 * the geo bench uses, so THE REGEX WALL refuses a bad one a round trip before
 * `seo.site_geo_area_assert_tokens` would.
 *
 * Prefill comes from `web.business_location` — the brand's OWN saved addresses,
 * the record this platform already keeps. We suggest, never assume: the towns a
 * business SERVES are not the towns it sits in, and only the expert knows that.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useEffect, useMemo, useState } from "react";
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
import { GeoPlacePicker } from "../rules/GeoPlacePicker";
import { parseTokens, unsafeTokens, type GeoPlace } from "../rules/types";
import type { StarterPackGeoAreaItem } from "../types";

/** What the caller hands to `adoptStarterPack`, keyed by pack item id. */
export interface GeoPlacesDraft {
  /** Typed words — `p_geo_places`. */
  tokens: Record<string, string[]>;
  /** Gazetteer place ids — `p_geo_place_ids`, the preferred half. */
  placeIds: Record<string, string[]>;
}

interface AreaDraft {
  tokensText: string;
  places: GeoPlace[];
}

const EMPTY_AREA: AreaDraft = { tokensText: "", places: [] };

/**
 * Suggestions drawn from the brand's saved locations. A locality is a real
 * place name; a region ("New Jersey") is offered separately and clearly
 * labelled, because serving a whole state is a much bigger claim than sitting
 * in one.
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

function unsafeIn(tokensText: string): string[] {
  return unsafeTokens(parseTokens(tokensText));
}

function AreaRow({
  area,
  draft,
  onChange,
  suggestions,
}: {
  area: StarterPackGeoAreaItem;
  draft: AreaDraft;
  onChange: (next: AreaDraft) => void;
  suggestions: string[];
}) {
  const tokens = parseTokens(draft.tokensText);
  const unsafe = unsafeIn(draft.tokensText);
  const filled = tokens.length + draft.places.length;
  const addSuggestion = (suggestion: string) => {
    if (tokens.includes(suggestion)) return;
    onChange({
      ...draft,
      tokensText: draft.tokensText.trim()
        ? `${draft.tokensText.replace(/[\s,]+$/, "")}, ${suggestion}`
        : suggestion,
    });
  };

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{area.label}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {area.geo_band}
          </Badge>
          {filled === 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
              <TriangleAlert className="h-3 w-3" aria-hidden />
              no places — will match nothing
            </span>
          ) : (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {filled} place{filled === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      {area.notes ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{area.notes}</p>
      ) : null}

      <div className="mt-2">
        <GeoPlacePicker
          places={draft.places}
          onChange={(places) => onChange({ ...draft, places })}
        />
      </div>

      <details className="mt-2 group">
        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
          Somewhere the list does not have? Type it
        </summary>
        <Textarea
          value={draft.tokensText}
          onChange={(event) => onChange({ ...draft, tokensText: event.target.value })}
          rows={2}
          placeholder={"ironbound, meadowlands"}
          className="mt-1.5 text-xs"
          aria-label={`Typed place names for ${area.label}`}
        />
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          One per line or separated by commas. Each is matched as a whole word
          inside the search — “newark” matches “data destruction newark”, not
          “newarkshire”.
        </p>
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
      </details>

      {unsafe.length > 0 ? (
        <p className="mt-1.5 text-[11px] leading-4 text-warning">
          “{unsafe.join("”, “")}” cannot be used — a typed place name can only
          contain letters, numbers, spaces and &apos; - . / &amp; _ , because
          each one becomes a whole-word search.
        </p>
      ) : null}
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
  /** Both maps are empty when the person deliberately skipped this step. */
  onAdopt: (draft: GeoPlacesDraft) => void;
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

  const ordered = useMemo(() => [...areas].sort((a, b) => a.sort - b.sort), [areas]);

  /**
   * Prefill the FIRST archetype — the pack's own primary/ideal area — with the
   * cities the brand actually has addresses in, and nothing else. The wider
   * bands are judgements only the expert can make, so they start empty rather
   * than starting wrong.
   */
  const [draft, setDraft] = useState<Record<string, AreaDraft>>({});
  const [prefilled, setPrefilled] = useState(false);
  const firstAreaId = ordered[0]?.item_id ?? null;
  const suggestedCities = suggestions.cities.join(", ");
  useEffect(() => {
    if (prefilled || !locations.isSuccess || !firstAreaId) return;
    setPrefilled(true);
    if (suggestedCities) {
      setDraft({ [firstAreaId]: { ...EMPTY_AREA, tokensText: suggestedCities } });
    }
  }, [prefilled, locations.isSuccess, firstAreaId, suggestedCities]);

  const result: GeoPlacesDraft = { tokens: {}, placeIds: {} };
  let filledAreas = 0;
  let unsafeCount = 0;
  for (const area of ordered) {
    const areaDraft = draft[area.item_id] ?? EMPTY_AREA;
    const tokens = parseTokens(areaDraft.tokensText);
    unsafeCount += unsafeTokens(tokens).length;
    if (tokens.length > 0) result.tokens[area.item_id] = tokens;
    if (areaDraft.places.length > 0)
      result.placeIds[area.item_id] = areaDraft.places.map((place) => place.id);
    if (tokens.length > 0 || areaDraft.places.length > 0) filledAreas += 1;
  }
  const pending = ordered.length - filledAreas;
  const blocked = unsafeCount > 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="flex max-h-[92dvh] w-[min(48rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
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
              nothing is prefilled. Search for the towns, cities or states each
              area stands for.
            </p>
          ) : null}
          {suggestions.regions.length > 0 ? (
            <p className="mb-3 text-[11px] leading-4 text-muted-foreground">
              Your locations are also in{" "}
              <span className="font-medium text-foreground">
                {suggestions.regions.join(", ")}
              </span>{" "}
              — add a state only where you genuinely serve the whole of it.
            </p>
          ) : null}

          <ul className="space-y-2">
            {ordered.map((area) => (
              <AreaRow
                key={area.item_id}
                area={area}
                draft={draft[area.item_id] ?? EMPTY_AREA}
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
              ? "Fix the typed place names above before adopting."
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
                onClick={() => onAdopt({ tokens: {}, placeIds: {} })}
                disabled={busy}
                className="text-xs"
              >
                Skip — I&apos;ll add places later
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => onAdopt(result)}
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
