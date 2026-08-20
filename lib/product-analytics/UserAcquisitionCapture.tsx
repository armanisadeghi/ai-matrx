"use client";

import { useEffect } from "react";
import { getFingerprint } from "@/lib/services/fingerprint-service";
import {
  ACQUISITION_STORAGE_KEY,
  ACQUISITION_VISITOR_COOKIE,
  FirstTouchPayloadSchema,
  isLocalAcquisitionHost,
  isLocalAcquisitionReferrer,
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

function acquisitionVisitorId(): string | null {
  const prefix = `${ACQUISITION_VISITOR_COOKIE}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function buildPayload(
  visitorId: string,
  guestFingerprint: string,
): FirstTouchPayload {
  const url = new URL(window.location.href);
  const referrer = safeObservedUrl(document.referrer);
  let referrerHost: string | null = null;
  if (referrer) {
    try {
      referrerHost = new URL(referrer).host;
    } catch {
      referrerHost = null;
    }
  }
  const value = (key: string) =>
    url.searchParams.get(key)?.slice(0, 500) ?? null;
  return {
    fingerprint: visitorId,
    guest_fingerprint: guestFingerprint,
    captured_at: new Date().toISOString(),
    landing_host: url.host.slice(0, 255),
    landing_path: url.pathname.slice(0, 1000),
    referrer,
    utm_source: value("utm_source"),
    utm_medium: value("utm_medium"),
    utm_campaign: value("utm_campaign"),
    utm_content: value("utm_content"),
    utm_term: value("utm_term"),
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 100) ?? null,
    language: navigator.language?.slice(0, 50) ?? null,
    screen: `${window.screen.width}x${window.screen.height}`,
    capture_source: "browser_enrichment",
    referrer_state:
      isLocalAcquisitionHost(url.host) ||
      isLocalAcquisitionReferrer(document.referrer)
        ? "local_test"
        : !referrer
          ? "direct_or_withheld"
          : referrerHost === url.host
            ? "internal"
            : "external",
    sec_fetch_site: null,
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
      const guestFingerprint = await getFingerprint();
      if (cancelled) return;
      const visitorId = acquisitionVisitorId() ?? guestFingerprint;
      const sessionKey = `${ACQUISITION_STORAGE_KEY}:${visitorId}:persisted`;
      try {
        if (sessionStorage.getItem(sessionKey)) return;
      } catch {
        // Privacy-restricted browsers can disable session storage. The atomic
        // database function makes a repeat enrichment harmless.
      }
      const stored = readStored();
      const observed = buildPayload(visitorId, guestFingerprint);
      const payload: FirstTouchPayload = stored
        ? {
            ...observed,
            ...stored,
            fingerprint: visitorId,
            guest_fingerprint: guestFingerprint,
            timezone: observed.timezone,
            language: observed.language,
            screen: observed.screen,
            capture_source: "browser_enrichment",
          }
        : observed;
      try {
        localStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Persistence is an optimization; the request still carries the data.
      }

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
      } else {
        try {
          sessionStorage.setItem(sessionKey, "1");
        } catch {
          // See the privacy-mode note above.
        }
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
