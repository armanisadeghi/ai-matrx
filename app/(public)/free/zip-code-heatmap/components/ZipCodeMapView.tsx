"use client";

// The ONE react-leaflet edge for the zip-code heatmap (code-splitting skill,
// rule 3): ZipCodeMap used to wrap five react-leaflet exports in five
// separate next/dynamic boundaries — five loadables over one dependency.
// Everything leaflet-flavored (components + CSS) now compiles statically
// inside this view, loaded through the single dynamic() in ZipCodeMap.tsx.

import type { MutableRefObject } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
} from "react-leaflet";
import type { LatLngExpression, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import chroma from "chroma-js";
import type { ZipCodeData } from "../page";
import type { ScaledValue } from "../utils/colorScaling";
import type { ViewMode } from "./ViewModeSelector";

interface ZipCodeLocation {
  zipCode: string;
  lat: number;
  lng: number;
  count: number;
}

export interface ZipCodeMapViewProps {
  center: LatLngExpression;
  isDark: boolean;
  mapRef: MutableRefObject<LeafletMap | null>;
  tileConfig: { url: string; attribution: string };
  zipLocations: ZipCodeLocation[];
  colorMapping: Map<number, ScaledValue> | null;
  viewMode: ViewMode;
  data: ZipCodeData[];
}

export default function ZipCodeMapView({
  center,
  isDark,
  mapRef,
  tileConfig,
  zipLocations,
  colorMapping,
  viewMode,
  data,
}: ZipCodeMapViewProps) {
  return (
    <MapContainer
      center={center}
      zoom={4}
      style={{ height: "100%", width: "100%", borderRadius: "0.5rem" }}
      className={isDark ? "leaflet-dark" : "leaflet-light"}
      ref={mapRef}
      scrollWheelZoom={true}
    >
      <TileLayer url={tileConfig.url} attribution={tileConfig.attribution} />

      {zipLocations.map((location) => {
        const scaledValue = colorMapping?.get(location.count);
        const color = scaledValue?.color || "#3b82f6";

        // Scale radius based on scaled value and view mode
        // Larger markers for aggregated views
        const baseRadius = viewMode === "zipCode" ? 8 : 12;
        const maxRadius = viewMode === "zipCode" ? 30 : 50;
        const radiusScale = scaledValue?.scaledValue || 0.5;
        const radius = baseRadius + (maxRadius - baseRadius) * radiusScale;

        return (
          <CircleMarker
            key={location.zipCode}
            center={[location.lat, location.lng]}
            radius={radius}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.7,
              color: chroma(color).darken(1).hex(),
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
              <div className="text-xs font-medium">
                <div className="font-bold">
                  {/* Use displayLabel if available (for aggregated views) */}
                  {data.find((d) => d.zipCode === location.zipCode)
                    ?.displayLabel || location.zipCode}
                </div>
                <div>Count: {location.count.toLocaleString()}</div>
              </div>
            </Tooltip>
            <Popup>
              <div className="text-sm">
                <div className="font-bold text-base mb-1">
                  {data.find((d) => d.zipCode === location.zipCode)
                    ?.displayLabel ||
                    (viewMode === "zipCode"
                      ? `Zip Code: ${location.zipCode}`
                      : location.zipCode)}
                </div>
                <div className="text-muted-foreground">
                  Count:{" "}
                  <span className="font-semibold text-foreground">
                    {location.count.toLocaleString()}
                  </span>
                </div>
                {viewMode === "zip3" &&
                  data.find((d) => d.zipCode === location.zipCode)
                    ?.originalId && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Region:{" "}
                      {
                        data.find((d) => d.zipCode === location.zipCode)
                          ?.originalId
                      }
                    </div>
                  )}
                <div className="text-xs text-muted-foreground mt-1">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
