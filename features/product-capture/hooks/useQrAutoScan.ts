"use client";

/**
 * useQrAutoScan — watches the live camera preview for QR codes while the
 * user keeps shooting (capture Mode 2). Decodes through the ONE platform
 * decoder (`lib/qr/decode.ts` — native BarcodeDetector, jsqr fallback) on a
 * timer tick, same cadence as `components/qr/QrCodeInput.tsx`.
 *
 * Dedupe rules — a QR code sits in frame for many ticks, so:
 * - the current item's own code never re-fires;
 * - the same value re-fires only after it has been OUT of frame for
 *   {@link QR_REPEAT_COOLDOWN_MS} (scanning the same code again later is a
 *   deliberate "new unit of the same product").
 */

import { useEffect, useRef } from "react";

import { decodeQrFromElement } from "@ai-matrx/kit/qr";

const SCAN_INTERVAL_MS = 250;
const QR_REPEAT_COOLDOWN_MS = 4000;

export function useQrAutoScan(args: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  /** The code already on the current item (never re-fires). */
  currentCode: string | null;
  onCode: (code: string) => void;
}) {
  const { videoRef, enabled, currentCode, onCode } = args;

  // Refs so the tick loop never restarts on state churn.
  const currentCodeRef = useRef(currentCode);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    currentCodeRef.current = currentCode;
    onCodeRef.current = onCode;
  }, [currentCode, onCode]);
  const lastSeenRef = useRef<{ value: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        try {
          const text = await decodeQrFromElement(video);
          if (text && !cancelled) {
            const now = Date.now();
            const last = lastSeenRef.current;
            const isRepeat =
              last !== null &&
              last.value === text &&
              now - last.at < QR_REPEAT_COOLDOWN_MS;
            lastSeenRef.current = { value: text, at: now };
            if (!isRepeat && text !== currentCodeRef.current) {
              onCodeRef.current(text);
            }
          }
        } catch {
          // A frame that fails to decode is a miss, never a crash.
        }
      }
      if (!cancelled) {
        timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, videoRef]);
}
