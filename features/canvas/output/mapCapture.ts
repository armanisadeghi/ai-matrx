"use client";

/**
 * Pictures of a map. A DOM capture of Leaflet draws its tiles blank or taints
 * the picture (they come from OpenStreetMap's origin), so a map is drawn
 * tile by tile instead:
 *   - `captureLeafletMap`: the LIVE map, exactly as the viewer sees it (its
 *     tiles — loaded with CORS — at their on-screen boxes, then the markers,
 *     popups and attribution drawn over them).
 *   - `renderStaticMap`: a map drawn from its spec alone (the message print,
 *     where nothing is mounted): the markers fitted, OSM tiles, numbered pins.
 */

import type { MapMarker } from "@/components/mardown-display/blocks/map/MapCanvas";

const TILE = 256;
const ATTRIBUTION = "© OpenStreetMap contributors";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`a map tile could not load (${src})`));
    img.src = src;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the map picture could not be encoded"))), "image/png"),
  );
}

/** The Leaflet map inside `root` (the root itself when it is one). */
export function findLeafletMap(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  if (root.classList.contains("leaflet-container")) return root;
  return root.querySelector<HTMLElement>(".leaflet-container");
}

/** The live map, as drawn on screen, at the device's pixel ratio. */
export async function captureLeafletMap(map: HTMLElement): Promise<Blob> {
  const box = map.getBoundingClientRect();
  if (!box.width || !box.height) throw new Error("the map is not on screen");
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("the browser refused a drawing surface");
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, box.width, box.height);

  const tiles = [...map.querySelectorAll<HTMLImageElement>("img.leaflet-tile")].filter(
    (tile) => tile.complete && tile.naturalWidth > 0 && tile.classList.contains("leaflet-tile-loaded"),
  );
  await Promise.all(
    tiles.map(async (tile) => {
      const at = tile.getBoundingClientRect();
      if (at.right < box.left || at.left > box.right || at.bottom < box.top || at.top > box.bottom) return;
      // A tile already loaded with CORS draws as is; any other is fetched again with CORS.
      const source = tile.crossOrigin ? tile : await loadImage(tile.src).catch(() => null);
      if (source) ctx.drawImage(source, at.left - box.left, at.top - box.top, at.width, at.height);
    }),
  );

  // Markers, popups, vectors and the attribution — everything but the tiles and the zoom buttons.
  const { renderElement } = await import("@ai-matrx/alchemy/operate/capture");
  const overlay = await renderElement(map, {
    pixelRatio: ratio,
    filter: (node) =>
      !(node instanceof HTMLElement) ||
      !(node.classList.contains("leaflet-tile-pane") || node.classList.contains("leaflet-control-zoom")),
    style: { background: "transparent" },
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas);
}

// ─── A map drawn from its spec (Web Mercator) ────────────────────────────────

function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const clamped = Math.max(Math.min(lat, 85.0511), -85.0511);
  const rad = (clamped * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale,
  };
}

function fitZoom(markers: readonly MapMarker[], width: number, height: number, pad: number): number {
  if (markers.length <= 1) return 13;
  for (let zoom = 17; zoom >= 1; zoom--) {
    const points = markers.map((m) => project(m.lat, m.lng, zoom));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= width - pad * 2 && Math.max(...ys) - Math.min(...ys) <= height - pad * 2) return zoom;
  }
  return 1;
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.save();
  ctx.translate(x - 13, y - 34);
  ctx.fillStyle = "#4F46E5";
  ctx.fill(new Path2D("M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z"));
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(13, 13, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e1b4b";
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 13, 13.5);
  ctx.restore();
}

export interface StaticMapSpec {
  readonly markers: readonly MapMarker[];
  readonly center?: readonly [number, number] | undefined;
  readonly zoom?: number | undefined;
}

/**
 * A PNG data URL of the map, pins numbered in marker order. Answers null when
 * no tile could be drawn (offline, blocked) — the caller then says so.
 */
export async function renderStaticMap(spec: StaticMapSpec, width = 720, height = 400): Promise<string | null> {
  const ratio = 2;
  const zoom = Math.round(spec.zoom ?? (spec.center ? 11 : fitZoom(spec.markers, width, height, 40)));
  const centerPoint = spec.center
    ? project(spec.center[0], spec.center[1], zoom)
    : (() => {
        const points = spec.markers.map((m) => project(m.lat, m.lng, zoom));
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        return points.length
          ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
          : project(20, 0, zoom);
      })();
  const left = centerPoint.x - width / 2;
  const top = centerPoint.y - height / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, width, height);

  const count = 2 ** zoom;
  const jobs: Promise<boolean>[] = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      const wrapped = ((tx % count) + count) % count;
      const x = tx * TILE - left;
      const y = ty * TILE - top;
      jobs.push(
        loadImage(`https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`)
          .then((img) => {
            ctx.drawImage(img, x, y, TILE, TILE);
            return true;
          })
          .catch(() => false),
      );
    }
  }
  const drawn = (await Promise.all(jobs)).filter(Boolean).length;
  if (drawn === 0) return null;

  spec.markers.forEach((marker, index) => {
    const point = project(marker.lat, marker.lng, zoom);
    drawPin(ctx, point.x - left, point.y - top, String(index + 1));
  });
  ctx.font = "10px system-ui, sans-serif";
  const textWidth = ctx.measureText(ATTRIBUTION).width;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(width - textWidth - 8, height - 16, textWidth + 8, 16);
  ctx.fillStyle = "#334155";
  ctx.textBaseline = "middle";
  ctx.fillText(ATTRIBUTION, width - textWidth - 4, height - 8);
  return canvas.toDataURL("image/png");
}
