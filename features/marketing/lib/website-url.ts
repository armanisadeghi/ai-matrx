const HOSTNAME_PATTERN = /^(?:[^.\s]+\.)+[^.\s]+$/u;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Turns the way people normally type a website into its canonical origin URL.
 * HTTPS is the default; an explicitly entered HTTP URL remains HTTP. Pasted
 * page paths, query strings, and fragments are intentionally discarded because
 * this form registers a website, not an individual page.
 */
export function normalizeWebsiteUrl(value: string): URL {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a website, such as example.com.");

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website, such as example.com.");
  }

  const hostname = parsed.hostname;
  const isHostname =
    HOSTNAME_PATTERN.test(hostname) ||
    IPV4_PATTERN.test(hostname) ||
    hostname.includes(":");
  if (
    !hostname ||
    !isHostname ||
    !["http:", "https:"].includes(parsed.protocol)
  ) {
    throw new Error("Enter a valid public website, such as example.com.");
  }

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function normalizeWebsiteUrlValue(value: string): string {
  return normalizeWebsiteUrl(value).toString();
}
