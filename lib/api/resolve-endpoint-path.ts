// lib/api/resolve-endpoint-path.ts
//
// The single primitive for transforming a backend endpoint PATH (never the
// base URL) before it is sent. This is how we change API versions or swap a
// route entirely for testing WITHOUT touching the server-selection logic — so
// localhost / prod / custom routing keeps working exactly as before. Only the
// path after the host changes.
//
// Two independent override layers, applied in priority order:
//
//   1. pathOverrides — an exact-match map from a canonical endpoint path
//      (the ENDPOINTS / generated-schema template, e.g. "/ai/manual" or
//      "/ai/agents/{agent_id}") to a full replacement path
//      (e.g. "/ai/v2/chat"). This handles ANY change — version bump AND a
//      core route rename — with zero code edits. This is the escape hatch
//      for "I need this one specific call to go somewhere else right now".
//
//   2. apiVersion — a global version segment inserted as a leading path
//      prefix for EVERY call that doesn't have an explicit pathOverride.
//      e.g. apiVersion "v2" turns "/ai/manual" into "/v2/ai/manual". This is
//      the broad "flip the whole app to the next version" switch. Leave it
//      null and nothing changes.
//
// Both layers default to off (null / empty), so an untouched app behaves
// identically to before this primitive existed.

export interface EndpointOverrideConfig {
  /**
   * Global leading version segment applied to every path that has no exact
   * pathOverride. `null` / empty → no version transform. The value may be
   * given with or without a leading slash ("v2" and "/v2" both work).
   */
  apiVersion?: string | null;

  /**
   * Exact-match canonical-path → replacement-path map. Keys are the path
   * template exactly as written in `ENDPOINTS` / the generated schema
   * (including any `{param}` segments). Wins over `apiVersion`.
   */
  pathOverrides?: Record<string, string>;
}

/** Normalize a path fragment to a single leading slash, no trailing slash. */
function normalizeLeadingSlash(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withLead = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLead.length > 1 && withLead.endsWith("/")
    ? withLead.slice(0, -1)
    : withLead;
}

/**
 * Resolve the final path for a canonical endpoint path, applying any active
 * override layers. Pure — given the same inputs it always returns the same
 * path. Callers prepend the resolved base URL themselves.
 *
 * @param canonicalPath The path exactly as declared in ENDPOINTS / the schema.
 * @param config        The active override layers (read from Redux).
 */
export function resolveEndpointPath(
  canonicalPath: string,
  config?: EndpointOverrideConfig | null,
): string {
  if (!config) return canonicalPath;

  // Layer 1 — exact path override wins outright.
  const override = config.pathOverrides?.[canonicalPath];
  if (override && override.trim()) {
    return normalizeLeadingSlash(override);
  }

  // Layer 2 — global version prefix.
  const version = config.apiVersion?.trim();
  if (version) {
    const prefix = normalizeLeadingSlash(version);
    const path = canonicalPath.startsWith("/")
      ? canonicalPath
      : `/${canonicalPath}`;
    return `${prefix}${path}`;
  }

  return canonicalPath;
}
