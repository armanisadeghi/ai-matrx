"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { LatLngExpression } from "leaflet";
import chroma from "chroma-js";
// Static CSS import — bundled only with this client component, so it never
// loads for other routes. A runtime `require('leaflet/dist/leaflet.css')`
// throws under Turbopack and crashed the whole route.
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin } from "lucide-react";
import { ZipCodeData } from "../page";
import { batchGeocodeZipCodes } from "../utils/zipCodeDatabase";
import { scaleValues } from "../utils/colorScaling";
import type { ScalingMethod, ColorScheme } from "./ColorScaleSelector";
import type { ViewMode } from "./ViewModeSelector";

// Dynamically import Leaflet components
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false },
);

const CircleMarker = dynamic(
  () => import("react-leaflet").then((mod) => mod.CircleMarker),
  { ssr: false },
);

const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), {
  ssr: false,
});

const Tooltip = dynamic(
  () => import("react-leaflet").then((mod) => mod.Tooltip),
  { ssr: false },
);

interface ZipCodeMapProps {
  data: ZipCodeData[];
  isLoading?: boolean;
  scalingMethod: ScalingMethod;
  colorScheme: ColorScheme;
  viewMode: ViewMode;
  isFullscreen?: boolean;
}

interface ZipCodeLocation {
  zipCode: string;
  lat: number;
  lng: number;
  count: number;
}

// US center coordinates
const US_CENTER: LatLngExpression = [39.8283, -98.5795];

export default function ZipCodeMap({
  data,
  isLoading = false,
  scalingMethod,
  colorScheme,
  viewMode,
  isFullscreen = false,
}: ZipCodeMapProps) {
  // Simple theme detection without dependencies
  const [isDark, setIsDark] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zipLocations, setZipLocations] = useState<ZipCodeLocation[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const mapRef = useRef<any>(null);

  // Detect system theme preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      setIsDark(darkModeQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
      darkModeQuery.addEventListener("change", handleChange);
      return () => darkModeQuery.removeEventListener("change", handleChange);
    }
    return undefined;
  }, []);

  // Gate map render until after client mount (react-leaflet is ssr:false).
  // Leaflet CSS is loaded via the static top-of-file import.
  useEffect(() => {
    setMapLoaded(true);
  }, []);

  // Geocode zip codes when data changes
  useEffect(() => {
    if (data.length === 0) {
      setZipLocations([]);
      return undefined;
    }

    let cancelled = false;

    const geocodeZipCodes = async () => {
      setIsGeocoding(true);
      setZipLocations([]); // Clear previous locations

      try {
        // Extract unique zip codes
        const zipCodes = data.map((item) => item.zipCode);

        // Use batch geocoding with progress tracking
        const results = await batchGeocodeZipCodes(
          zipCodes,
          (completed, total, currentResults) => {
            if (!cancelled) {
              // Update progress with current results
              const newLocations = data
                .map((item) => {
                  const coords = currentResults.get(item.zipCode);
                  return coords
                    ? {
                        zipCode: item.zipCode,
                        lat: coords.lat,
                        lng: coords.lng,
                        count: item.count,
                      }
                    : null;
                })
                .filter((loc): loc is ZipCodeLocation => loc !== null);

              setZipLocations(newLocations);
            }
          },
        );

        if (!cancelled) {
          // Final update with all locations
          const allLocations = data
            .map((item) => {
              const coords = results.get(item.zipCode);
              return coords
                ? {
                    zipCode: item.zipCode,
                    lat: coords.lat,
                    lng: coords.lng,
                    count: item.count,
                  }
                : null;
            })
            .filter((loc): loc is ZipCodeLocation => loc !== null);

          setZipLocations(allLocations);
          setIsGeocoding(false);

          // Log success/failure stats
          const successCount = allLocations.length;
          const failCount = data.length - successCount;
          console.log(
            `Geocoding complete: ${successCount} successful, ${failCount} failed`,
          );
          if (failCount > 0) {
            const failedZips = data
              .filter((item) => !results.has(item.zipCode))
              .map((item) => item.zipCode)
              .slice(0, 10);
            console.warn(`Failed zip codes (first 10):`, failedZips);
          }
        }
      } catch (error) {
        console.error("Batch geocoding error:", error);
        if (!cancelled) {
          setIsGeocoding(false);
        }
      }
    };

    geocodeZipCodes();

    // Cleanup function to cancel geocoding if component unmounts or data changes
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Auto-zoom when locations update
  useEffect(() => {
    if (zipLocations.length > 0 && mapRef.current && !isGeocoding) {
      const bounds = zipLocations.map(
        (loc) => [loc.lat, loc.lng] as LatLngExpression,
      );
      try {
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      } catch (error) {
        console.error("Error fitting bounds:", error);
      }
    }
  }, [zipLocations, isGeocoding]);

  // Invalidate map size when fullscreen state changes
  useEffect(() => {
    if (mapRef.current) {
      // Small delay to ensure DOM has updated
      const timer = setTimeout(() => {
        try {
          mapRef.current.invalidateSize();
        } catch (error) {
          console.error("Error invalidating map size:", error);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isFullscreen]);

  // Color scale with selected method and scheme
  const colorMapping = useMemo(() => {
    if (data.length === 0) return null;
    const counts = data.map((d) => d.count);
    return scaleValues(counts, scalingMethod, colorScheme);
  }, [data, scalingMethod, colorScheme]);

  // Tile layer config
  const tileConfig = useMemo(() => {
    if (isDark) {
      return {
        url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
        attribution:
          '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };
    }
    return {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
  }, [isDark]);

  if (!mapLoaded) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-muted/30 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {(isLoading || isGeocoding) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm font-medium">
            {isGeocoding
              ? `Geocoding zip codes... (${zipLocations.length}/${data.length})`
              : "Loading..."}
          </span>
        </div>
      )}

      {data.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30 rounded-lg z-[999]">
          <MapPin className="w-16 h-16 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-1">
            No Data Loaded
          </p>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to visualize zip codes
          </p>
        </div>
      )}

      <MapContainer
        center={US_CENTER}
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
    </div>
  );
}
