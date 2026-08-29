"use client";

/**
 * useTrackControls — HONEST torch + zoom over a live video track's real
 * capabilities (`MediaTrackCapabilities`). If the hardware doesn't report
 * torch or a zoom range, the corresponding control simply doesn't exist —
 * we never render a fake toggle.
 *
 * Zoom pill options are derived from the reported [min, max] range using the
 * familiar phone ladder (.5 / 1 / 2 / 4 / 8) clipped to what the device can
 * actually do. Applied via `track.applyConstraints({ advanced: [...] })`.
 *
 * Package source (`@ai-matrx/capture`) — browser media APIs only, no app
 * imports.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

// torch/zoom are spec'd in mediacapture-image but absent from lib.dom.
interface ExtendedCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
}
interface ExtendedSettings extends MediaTrackSettings {
  torch?: boolean;
  zoom?: number;
}

const ZOOM_LADDER = [0.5, 1, 2, 4, 8];

export interface TrackControls {
  torchSupported: boolean;
  torchOn: boolean;
  toggleTorch: () => void;
  /** ≥2 entries when the track reports a usable zoom range, else []. */
  zoomOptions: number[];
  zoom: number;
  setZoom: (factor: number) => void;
}

export function useTrackControls(stream: MediaStream | null): TrackControls {
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoomState] = useState(1);
  // Capabilities can be empty until the track is fully live; re-read once on
  // stream change and again on a short delayed tick (iOS reports late).
  const [caps, setCaps] = useState<ExtendedCapabilities | null>(null);

  const track = stream?.getVideoTracks()[0] ?? null;

  useEffect(() => {
    setTorchOn(false);
    if (!track || typeof track.getCapabilities !== "function") {
      setCaps(null);
      return;
    }
    const read = () => {
      try {
        setCaps(track.getCapabilities() as ExtendedCapabilities);
        const settings = track.getSettings() as ExtendedSettings;
        if (typeof settings.zoom === "number") setZoomState(settings.zoom);
      } catch {
        setCaps(null);
      }
    };
    read();
    const timer = window.setTimeout(read, 750);
    return () => window.clearTimeout(timer);
  }, [track]);

  const torchSupported = caps?.torch === true;

  const toggleTorch = useCallback(() => {
    if (!track || !torchSupported) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch((err: unknown) => {
        console.error("[capture-camera] torch toggle failed", err);
      });
  }, [track, torchSupported, torchOn]);

  const zoomOptions = useMemo(() => {
    const range = caps?.zoom;
    if (!range || !(range.max > range.min)) return [];
    const options = ZOOM_LADDER.filter(
      (f) => f >= range.min && f <= range.max,
    );
    if (!options.includes(1) && 1 >= range.min && 1 <= range.max) {
      options.push(1);
      options.sort((a, b) => a - b);
    }
    return options.length >= 2 ? options : [];
  }, [caps]);

  const setZoom = useCallback(
    (factor: number) => {
      if (!track || !caps?.zoom) return;
      const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, factor));
      track
        .applyConstraints({
          advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
        })
        .then(() => setZoomState(clamped))
        .catch((err: unknown) => {
          console.error("[capture-camera] zoom failed", err);
        });
    },
    [track, caps],
  );

  return { torchSupported, torchOn, toggleTorch, zoomOptions, zoom, setZoom };
}
