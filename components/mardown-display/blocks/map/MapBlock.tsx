"use client";

/**
 * MapBlock — the in-chat render block for ```map fences.
 *
 * A JSON spec of markers/places renders as an interactive Leaflet map (pan,
 * zoom, marker popups, auto-fit bounds). Great for itineraries, store locators,
 * "where is X". Light shell: leaflet is isolated in MapCanvas, loaded ONLY via
 * `next/dynamic ssr:false` so it never enters the server build.
 */

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, MapPin, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { MapMarker } from "./MapCanvas";

interface MapSpec {
  title?: string;
  center?: [number, number];
  zoom?: number;
  markers: MapMarker[];
}

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export interface MapBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function parseMap(raw: string): MapSpec | { error: string } {
  let s = raw.trim();
  const fenced = /^```(?:json|map)?\s*\n([\s\S]*?)\n?```$/.exec(s);
  if (fenced) s = fenced[1].trim();
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    try {
      obj = JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return { error: "Map needs a JSON object with a `markers` array." };
    }
  }
  const o = (Array.isArray(obj) ? { markers: obj } : obj) as Record<string, unknown>;
  const rawMarkers = Array.isArray(o.markers) ? o.markers : Array.isArray(o.places) ? o.places : [];
  const markers: MapMarker[] = (rawMarkers as Record<string, unknown>[])
    .map((m) => {
      const lat = num(m?.lat ?? m?.latitude ?? (Array.isArray(m?.coordinates) ? m.coordinates[0] : undefined) ?? (Array.isArray(m?.coords) ? m.coords[0] : undefined));
      const lng = num(m?.lng ?? m?.lon ?? m?.longitude ?? (Array.isArray(m?.coordinates) ? m.coordinates[1] : undefined) ?? (Array.isArray(m?.coords) ? m.coords[1] : undefined));
      if (lat == null || lng == null) return null;
      return { lat, lng, label: m?.label != null ? String(m.label ?? m.name) : m?.name != null ? String(m.name) : undefined, description: m?.description != null ? String(m.description) : undefined };
    })
    .filter((m): m is MapMarker => m != null);
  if (markers.length === 0) return { error: "Map `markers` need at least one {lat, lng} point." };
  const c = o.center as unknown;
  const center = Array.isArray(c) && num(c[0]) != null && num(c[1]) != null ? ([num(c[0])!, num(c[1])!] as [number, number]) : undefined;
  return { title: typeof o.title === "string" ? o.title : undefined, center, zoom: num(o.zoom), markers };
}

export const MapBlock: React.FC<MapBlockProps> = ({ content = "", isStreamActive = false, className }) => {
  const parsed = useMemo(() => (isStreamActive ? null : parseMap(content)), [content, isStreamActive]);
  const spec = parsed && !("error" in parsed) ? parsed : null;
  const error = parsed && "error" in parsed ? parsed.error : null;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">{spec?.title ?? "Map"}</span>
          {spec && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {spec.markers.length} {spec.markers.length === 1 ? "place" : "places"}
            </span>
          )}
          {isStreamActive && <span className="shrink-0 animate-pulse text-xs text-muted-foreground">…</span>}
        </div>
        {!isStreamActive && spec && (
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy source"}
            title={copied ? "Copied" : "Copy source"}
            onClick={handleCopy}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="p-3">
        {isStreamActive ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : spec ? (
          <div className="h-72 w-full overflow-hidden rounded-md border border-border">
            <MapCanvas markers={spec.markers} center={spec.center} zoom={spec.zoom} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MapBlock;
