"use client";

/**
 * Canonical components for the system-wide primitive kinds the search family
 * nests: `rating`, `opening_hours`, `postal_address`, `geo_coordinates`.
 * Each is dispatched standalone by the block registry AND composed by parent
 * kind components (local_place, entity_card, web_result).
 */

import React from "react";
import { Clock, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { items, num, readSearchKindValue, text } from "./search-kind-data";
import { RatingStars } from "./search-kind-shared";

interface SearchKindBlockProps {
  serverData?: unknown;
  className?: string;
}

// ── rating ──────────────────────────────────────────────────────────────────

export function RatingBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"rating">(serverData);
  const rating = num(value.value);
  if (rating === null) return null;
  return (
    <RatingStars
      value={rating}
      bestPossible={num(value.best_possible)}
      count={num(value.count)}
      className={className}
    />
  );
}

// ── opening_hours ───────────────────────────────────────────────────────────

function dayLabel(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3);
}

export function OpeningHoursBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"opening_hours">(serverData);
  const days = items(value.days);
  const today = value.today ?? null;
  const todayName = today ? text(today.day) : null;

  if (days.length === 0 && !today) return null;

  return (
    <div className={cn("text-xs", className)}>
      <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Hours</span>
        {today && (
          <span className="text-muted-foreground">
            · today {text(today.opens)}–{text(today.closes)}
          </span>
        )}
      </div>
      {days.length > 0 && (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {days.map((d, i) => {
            const name = text(d.day);
            const isToday = name !== null && name === todayName;
            return (
              <React.Fragment key={i}>
                <span
                  className={cn(
                    "text-muted-foreground",
                    isToday && "font-medium text-foreground",
                  )}
                >
                  {name ? dayLabel(name) : ""}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-muted-foreground",
                    isToday && "font-medium text-foreground",
                  )}
                >
                  {text(d.opens)}–{text(d.closes)}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── postal_address ──────────────────────────────────────────────────────────

export function PostalAddressBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"postal_address">(serverData);
  const display = text(value.display);
  if (!display) return null;
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5 text-sm text-muted-foreground",
        className,
      )}
    >
      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>{display}</span>
    </span>
  );
}

// ── geo_coordinates — a coordinate pair is a door to a map (No Dead Ends). ──

export function GeoCoordinatesBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue<"geo_coordinates">(serverData);
  const lat = num(value.latitude);
  const lon = num(value.longitude);
  if (lat === null || lon === null) return null;
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline",
        className,
      )}
      title="Open in map"
    >
      <Navigation className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </span>
    </a>
  );
}
