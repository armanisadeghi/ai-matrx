"use client";

import { useEffect } from "react";
import { getFingerprint } from "@/lib/services/fingerprint-service";
import {
  ACQUISITION_STORAGE_KEY,
  FirstTouchPayloadSchema,
  safeObservedUrl,
  type FirstTouchPayload,
} from "./user-acquisition";

function readStored(): FirstTouchPayload | null {
  try {
    const raw = localStorage.getItem(ACQUISITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = FirstTouchPayloadSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch (error) {
    console.error("[user-acquisition] Could not read first-touch state", error);
  }
  return null;
}

function buildPayload(fingerprint: string): FirstTouchPayload {
  const url = new URL(window.location.href);
  const value = (key: string) =>
    url.searchParams.get(key)?.slice(0, 500) ?? null;
  return {
    fingerprint,
    captured_at: new Date().toISOString(),
    landing_host: url.host.slice(0, 255),
    landing_path: url.pathname.slice(0, 1000),
    referrer: safeObservedUrl(document.referrer)?.slice(0, 2000) ?? null,
    utm_source: value("utm_source"),
    utm_medium: value("utm_medium"),
    utm_campaign: value("utm_campaign"),
    utm_content: value("utm_content"),
    utm_term: value("utm_term"),
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 100) ?? null,
    language: navigator.language?.slice(0, 50) ?? null,
    screen: `${window.screen.width}x${window.screen.height}`,
  };
}

export function UserAcquisitionCapture() {
  useEffect(() => {
    if (
      window.location.pathname.startsWith("/administration") ||
      window.location.pathname.startsWith("/auth") ||
      window.location.pathname.startsWith("/login")
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const fingerprint = await getFingerprint();
      if (cancelled) return;
      const stored = readStored();
      const payload = stored ?? buildPayload(fingerprint);
      if (!stored)
        localStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(payload));

      const response = await fetch("/api/acquisition/first-touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (!response.ok) {
        console.error(
          "[user-acquisition] First-touch persistence failed",
          response.status,
          await response.text(),
        );
      }
    })().catch((error: unknown) => {
      console.error("[user-acquisition] First-touch capture failed", error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
