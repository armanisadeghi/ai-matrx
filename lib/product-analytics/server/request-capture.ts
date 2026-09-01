import "server-only";

import type { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import {
  ACQUISITION_VISITOR_COOKIE,
  FirstTouchPayloadSchema,
  isLocalAcquisitionHost,
  safeObservedUrl,
  type FirstTouchPayload,
} from "../user-acquisition";
import { recordAcquisitionFirstTouch } from "./acquisition-persistence";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

interface RequestCapture {
  visitorId: string;
  setCookie: boolean;
}

function requestIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function referrerState(
  landingHost: string,
  referrer: string | null,
): FirstTouchPayload["referrer_state"] {
  if (isLocalAcquisitionHost(landingHost)) return "local_test";
  if (!referrer) return "direct_or_withheld";
  try {
    const source = new URL(referrer);
    if (isLocalAcquisitionHost(source.host)) return "local_test";
    return source.host === landingHost ? "internal" : "external";
  } catch {
    return "direct_or_withheld";
  }
}

function shouldCapture(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? request.nextUrl.host;
  return (
    !path.startsWith("/administration") &&
    !path.startsWith("/api") &&
    !path.startsWith("/auth") &&
    !host.startsWith("manage.")
  );
}

function payloadFromRequest(
  request: NextRequest,
  visitorId: string,
): FirstTouchPayload {
  const referrer = safeObservedUrl(request.headers.get("referer") ?? "");
  const value = (key: string) =>
    request.nextUrl.searchParams.get(key)?.slice(0, 500) ?? null;
  return FirstTouchPayloadSchema.parse({
    fingerprint: visitorId,
    guest_fingerprint: null,
    captured_at: new Date().toISOString(),
    landing_host: request.nextUrl.host.slice(0, 255),
    landing_path: request.nextUrl.pathname.slice(0, 1000),
    referrer,
    utm_source: value("utm_source"),
    utm_medium: value("utm_medium"),
    utm_campaign: value("utm_campaign"),
    utm_content: value("utm_content"),
    utm_term: value("utm_term"),
    timezone: null,
    language: request.headers.get("accept-language")?.slice(0, 50) ?? null,
    screen: null,
    capture_source: "server_request",
    referrer_state: referrerState(request.nextUrl.host, referrer),
    sec_fetch_site: request.headers.get("sec-fetch-site")?.slice(0, 50) ?? null,
  });
}

/** Queue first-touch persistence without placing Postgres on the response path. */
export function prepareAcquisitionCapture(
  request: NextRequest,
  event: NextFetchEvent,
): RequestCapture | null {
  if (!shouldCapture(request)) return null;
  const existing = request.cookies.get(ACQUISITION_VISITOR_COOKIE)?.value;
  const visitorId =
    existing && /^[A-Za-z0-9]{16,200}$/.test(existing)
      ? existing
      : crypto.randomUUID().replaceAll("-", "");
  if (!existing) {
    const payload = payloadFromRequest(request, visitorId);
    event.waitUntil(
      recordAcquisitionFirstTouch({
        payload,
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent"),
      }).catch((error: unknown) => {
        console.error(
          "[user-acquisition] Server first-touch persistence failed",
          error,
        );
      }),
    );
  }
  return { visitorId, setCookie: !existing };
}

export function applyAcquisitionCookie(
  response: NextResponse,
  capture: RequestCapture | null,
  request: NextRequest,
): NextResponse {
  if (!capture?.setCookie) return response;
  const hostname = request.nextUrl.hostname.toLowerCase();
  const sharedDomain =
    hostname === "aimatrx.com" || hostname.endsWith(".aimatrx.com")
      ? ".aimatrx.com"
      : undefined;
  // 🚨 RAW APPEND, NOT `response.cookies.set`. This runs LAST in `proxy.ts`, on
  // the response the auth pass already finished with — and `ResponseCookies.set`
  // re-parses the WHOLE `Set-Cookie` list into its one-entry-per-NAME map and
  // rewrites it, silently discarding raw appended headers even for unrelated
  // cookie names. That is not theoretical: on 2026-09-01 this call destroyed
  // every split-auth-cookie-jar expiry `@ai-matrx/data/next` had just written,
  // so `www` healed nothing while `manage` (which was not setting a visitor
  // cookie) healed correctly — proven with `curl` against production. Appending
  // is strictly additive and can never eat another header.
  const parts = [
    `${ACQUISITION_VISITOR_COOKIE}=${encodeURIComponent(capture.visitorId)}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (sharedDomain) parts.push(`Domain=${sharedDomain}`);
  if (request.nextUrl.protocol === "https:") parts.push("Secure");
  response.headers.append("Set-Cookie", parts.join("; "));
  return response;
}
