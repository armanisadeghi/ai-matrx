import { z } from "zod";

export const ACQUISITION_STORAGE_KEY = "matrx:first-touch:v1";

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const FirstTouchPayloadSchema = z.object({
  fingerprint: z.string().regex(/^[a-zA-Z0-9]{16,200}$/),
  captured_at: z.iso.datetime(),
  landing_host: z.string().trim().min(1).max(255),
  landing_path: z.string().trim().startsWith("/").max(1000),
  referrer: nullableText(2000),
  utm_source: nullableText(500),
  utm_medium: nullableText(500),
  utm_campaign: nullableText(500),
  utm_content: nullableText(500),
  utm_term: nullableText(500),
  timezone: nullableText(100),
  language: nullableText(50),
  screen: nullableText(50),
});

export type FirstTouchPayload = z.infer<typeof FirstTouchPayloadSchema>;

export type AcquisitionTrafficKind = "browser" | "bot" | "unknown";

const BOT_USER_AGENT =
  /\b([a-z0-9_-]*bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|semrush|ahrefs|bytespider)\b/i;

export function classifyAcquisitionTraffic(
  userAgent: string | null,
): AcquisitionTrafficKind {
  if (!userAgent) return "unknown";
  return BOT_USER_AGENT.test(userAgent) ? "bot" : "browser";
}

export function describeAcquisitionClient(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  if (BOT_USER_AGENT.test(userAgent)) {
    const named = userAgent.match(
      /(bingbot|googlebot|bytespider|facebookexternalhit|semrushbot|ahrefsbot|uptimerobot|[a-z0-9_-]+bot)/i,
    )?.[1];
    return named ?? "Automated crawler";
  }

  const browser =
    userAgent.match(/Edg\/([\d.]+)/)?.[1] != null
      ? `Edge ${userAgent.match(/Edg\/([\d.]+)/)?.[1]}`
      : userAgent.match(/Firefox\/([\d.]+)/)?.[1] != null
        ? `Firefox ${userAgent.match(/Firefox\/([\d.]+)/)?.[1]}`
        : userAgent.match(/Chrome\/([\d.]+)/)?.[1] != null
          ? `Chrome ${userAgent.match(/Chrome\/([\d.]+)/)?.[1]}`
          : userAgent.match(/Version\/([\d.]+).*Safari/)?.[1] != null
            ? `Safari ${userAgent.match(/Version\/([\d.]+).*Safari/)?.[1]}`
            : "Browser";

  const platform = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : null;

  return platform ? `${browser} · ${platform}` : browser;
}

export function safeObservedUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}
