const SUPABASE_PROJECT_REF_RE = /^[a-z0-9]{20}$/;

/**
 * Keep an OAuth connection override on the catalog provider's exact HTTPS
 * endpoint. OAuth discovery may vary by query string (for example a scoped
 * Supabase project), but must never become an arbitrary browser-supplied URL.
 */
export function validateSupabaseScopedMcpEndpointOverride(
  catalogEndpoint: string,
  endpointOverride: string,
): string {
  const catalog = new URL(catalogEndpoint);
  const candidate = new URL(endpointOverride);

  if (catalog.protocol !== "https:" || candidate.protocol !== "https:") {
    throw new Error("MCP OAuth endpoints must use HTTPS");
  }
  if (
    candidate.origin !== catalog.origin ||
    candidate.pathname !== catalog.pathname ||
    candidate.username ||
    candidate.password ||
    candidate.hash
  ) {
    throw new Error(
      "The scoped MCP endpoint must use the catalog provider's exact host and path",
    );
  }

  const expectedKeys = ["features", "project_ref", "read_only"];
  const actualKeys = [...new Set(candidate.searchParams.keys())].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    expectedKeys.some((key) => candidate.searchParams.getAll(key).length !== 1)
  ) {
    throw new Error("The Supabase MCP endpoint has unsupported scope parameters");
  }

  const projectRef = candidate.searchParams.get("project_ref") ?? "";
  if (!SUPABASE_PROJECT_REF_RE.test(projectRef)) {
    throw new Error("Enter a valid 20-character Supabase project reference");
  }
  if (candidate.searchParams.get("read_only") !== "true") {
    throw new Error("Supabase MCP connections must remain read-only");
  }
  if (candidate.searchParams.get("features") !== "docs,database,debugging") {
    throw new Error(
      "Supabase MCP connections are limited to Docs, Database, and Debugging",
    );
  }

  return candidate.toString();
}

/** Build the deliberately narrow hosted Supabase MCP endpoint. */
export function buildSupabaseScopedMcpEndpoint(
  catalogEndpoint: string,
  projectRef: string,
): string {
  const normalizedRef = projectRef.trim().toLowerCase();
  if (!SUPABASE_PROJECT_REF_RE.test(normalizedRef)) {
    throw new Error("Enter a valid 20-character Supabase project reference");
  }

  const endpoint = new URL(catalogEndpoint);
  endpoint.search = "";
  endpoint.searchParams.set("project_ref", normalizedRef);
  endpoint.searchParams.set("read_only", "true");
  endpoint.searchParams.set("features", "docs,database,debugging");
  return validateSupabaseScopedMcpEndpointOverride(
    catalogEndpoint,
    endpoint.toString(),
  );
}
