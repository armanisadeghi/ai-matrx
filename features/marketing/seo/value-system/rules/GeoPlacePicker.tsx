"use client";

/**
 * THE PLACE PICKER — an area names places from the platform gazetteer instead
 * of words somebody typed from memory.
 *
 * Why this exists (I3, 2026-08-22): a typed token is a bare string matched as a
 * whole word, so "columbus" is four different cities, "mobile" is a phone, and
 * "near me" only works if the person thinks to type it. A gazetteer row carries
 * what the string cannot — its state, its aliases, its population, and whether
 * its name is also an ordinary English word and therefore only counts when a
 * state sits beside it. The resolver matches a picked place through the
 * keyword's DETECTED places (`seo.keyword_place`), so the ambiguity rule is
 * applied once, centrally, rather than re-guessed per site.
 *
 * Typed words are not deprecated and are not going away: a neighbourhood, an
 * industrial park or a local nickname is a real service area and the gazetteer
 * has never heard of it. Places and words live side by side in the same area.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, Flag, Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Input } from "@/components/ui/input";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { geoPlaceSearchQueryKey, searchGeoPlaces } from "./data";
import type { GeoPlace } from "./types";

const KINDS = ["state", "city", "grammar"];

function KindIcon({ kind }: { kind: string }) {
  if (kind === "state") return <Flag className="h-3 w-3" aria-hidden />;
  if (kind === "grammar") return <Navigation className="h-3 w-3" aria-hidden />;
  return <Building2 className="h-3 w-3" aria-hidden />;
}

function subtitle(place: GeoPlace): string {
  if (place.place_kind === "grammar")
    return "a way of saying “close to me” — no city named";
  if (place.place_kind === "state") return "state";
  return place.population
    ? `${place.population.toLocaleString()} people`
    : "city";
}

export function GeoPlacePicker({
  places,
  onChange,
}: {
  places: GeoPlace[];
  onChange: (next: GeoPlace[]) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 250);

  const results = useQuery({
    queryKey: geoPlaceSearchQueryKey(debounced.trim().toLowerCase(), KINDS),
    enabled: debounced.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => searchGeoPlaces(debounced.trim(), KINDS, 12, signal),
  });

  const chosen = new Set(places.map((place) => place.id));
  const add = (place: GeoPlace) => {
    if (chosen.has(place.id)) return;
    onChange([...places, place]);
    setQuery("");
  };
  const remove = (id: string) => onChange(places.filter((place) => place.id !== id));

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cities, states, or “near me”"
          className="h-8 pl-7 text-sm"
        />
        {results.isFetching ? (
          <Loader2
            className="absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>

      {results.isError ? (
        <InlineQueryError
          what="places"
          error={results.error}
          onRetry={() => void results.refetch()}
        />
      ) : null}

      {debounced.trim().length >= 2 && results.data ? (
        results.data.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
            No place by that name in the gazetteer — it holds the 50 states, the
            1,000 largest US cities and the “near me” phrases. Add it as a typed
            place name below instead; that still works exactly as it always did.
          </p>
        ) : (
          <ul className="max-h-44 divide-y divide-border overflow-y-auto overscroll-contain rounded-md border border-border scrollbar-thin">
            {results.data.map((place) => {
              const already = chosen.has(place.id);
              return (
                <li key={place.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => add(place)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                      already
                        ? "cursor-default bg-muted/40 text-muted-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      <KindIcon kind={place.place_kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">
                        {place.label}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {subtitle(place)}
                        {place.ambiguity === "requires_qualifier"
                          ? " · only counts with its state, because the name is an ordinary word too"
                          : ""}
                      </span>
                    </span>
                    {already ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">added</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {places.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {places.map((place) => (
            <li key={place.id}>
              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground">
                <span className="text-muted-foreground">
                  <KindIcon kind={place.place_kind} />
                </span>
                {place.label}
                <button
                  type="button"
                  onClick={() => remove(place.id)}
                  aria-label={`Remove ${place.label}`}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden />
          No places picked yet.
        </p>
      )}
    </div>
  );
}
