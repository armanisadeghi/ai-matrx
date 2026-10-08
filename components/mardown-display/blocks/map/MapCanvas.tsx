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
import { escapeHtml } from "@ai-matrx/kit/html-escape";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  description?: string;
  /** Draw a round labelled bubble (a rank, a mark) instead of the pin.
   *  `className` colours it; it is set on a plain element inside the map. */
  bubble?: { text: string; className: string };
}

function bubbleIcon(bubble: { text: string; className: string }): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span class="flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums shadow-sm ${escapeHtml(bubble.className)}">${escapeHtml(bubble.text)}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
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
    const fit = () => {
      if (pts.length === 1) map.setView(pts[0], 13);
      else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
    };
    fit();
    // Leaflet measures its box once. A map that mounts before its pane has a
    // size (a canvas pane sliding in, a list toggled beside it) fitted to a
    // zero box and landed at street level. Re-measure and re-fit on every
    // resize until the person moves the map themselves.
    let personMoved = false;
    const onDrag = () => {
      personMoved = true;
    };
    map.on("dragstart", onDrag);
    const el = map.getContainer();
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            map.invalidateSize();
            if (!personMoved) fit();
          });
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      map.off("dragstart", onDrag);
    };
  }, [map, key, hasExplicitCenter, markers]);
  return null;
}

/** Fly to the place a person picked from the list beside the map. */
function FocusMarker({ focus }: { focus: { lat: number; lng: number; seq: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [map, focus]);
  return null;
}

/** Leaflet measures its box once; a pane that resizes (list toggled, canvas split) re-measures. */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function MapCanvas({
  markers,
  center,
  zoom,
  focus = null,
}: {
  markers: MapMarker[];
  center?: [number, number];
  zoom?: number;
  focus?: { lat: number; lng: number; seq: number } | null;
}) {
  const initialCenter: [number, number] = center ?? (markers[0] ? [markers[0].lat, markers[0].lng] : [20, 0]);
  return (
    <MapContainer center={initialCenter} zoom={zoom ?? (center ? 11 : 4)} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        // CORS tiles (OSM serves them so) keep a drawn copy readable: print and Copy image.
        crossOrigin="anonymous"
      />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={m.bubble ? bubbleIcon(m.bubble) : PIN}>
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
      <FocusMarker focus={focus} />
      <InvalidateOnResize />
    </MapContainer>
  );
}
