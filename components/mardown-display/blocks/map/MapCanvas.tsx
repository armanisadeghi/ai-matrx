"use client";

/**
 * MapCanvas — the leaflet renderer for a MapBlock.
 *
 * BUNDLE POLICY: leaflet + react-leaflet are heavy and touch `window`. This is
 * the ONLY module importing them, and it is loaded EXCLUSIVELY via
 * `next/dynamic(() => import("./MapCanvas"), { ssr:false })` from MapBlock — so
 * leaflet never enters the server build or the initial bundle. Tiles are
 * OpenStreetMap (no API key); attribution is kept per OSM's terms.
 */

import "leaflet/dist/leaflet.css";
import React, { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  description?: string;
}

// A self-contained SVG pin — avoids leaflet's default-marker asset (which 404s
// under bundlers) entirely.
const PIN = L.divIcon({
  className: "",
  html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg"><path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z" fill="#4F46E5"/><circle cx="13" cy="13" r="5" fill="#fff"/></svg>`,
  iconSize: [26, 34],
  iconAnchor: [13, 34],
  popupAnchor: [0, -30],
});

function FitBounds({ markers, hasExplicitCenter }: { markers: MapMarker[]; hasExplicitCenter: boolean }) {
  const map = useMap();
  const key = useMemo(() => markers.map((m) => `${m.lat},${m.lng}`).join("|"), [markers]);
  useEffect(() => {
    if (hasExplicitCenter) return;
    const pts = markers.map((m) => [m.lat, m.lng] as [number, number]);
    if (pts.length === 1) map.setView(pts[0], 13);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
  }, [map, key, hasExplicitCenter, markers]);
  return null;
}

export default function MapCanvas({
  markers,
  center,
  zoom,
}: {
  markers: MapMarker[];
  center?: [number, number];
  zoom?: number;
}) {
  const initialCenter: [number, number] = center ?? (markers[0] ? [markers[0].lat, markers[0].lng] : [20, 0]);
  return (
    <MapContainer center={initialCenter} zoom={zoom ?? (center ? 11 : 4)} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={PIN}>
          {(m.label || m.description) && (
            <Popup>
              {m.label && <span className="font-semibold">{m.label}</span>}
              {m.label && m.description && <br />}
              {m.description && <span>{m.description}</span>}
            </Popup>
          )}
        </Marker>
      ))}
      <FitBounds markers={markers} hasExplicitCenter={!!center} />
    </MapContainer>
  );
}
