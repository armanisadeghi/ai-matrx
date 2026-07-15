// features/admin/catalogs/resolver.ts
//
// Client for the aidream link resolver:
//   POST {base}/api/catalog-resolver/resolve  { url, kind_hint? }
// Authenticated with the user's Supabase JWT via the canonical BackendClient
// (lib/api/backend-client.ts — same bearer path every aidream call uses).
// The endpoint ships in a parallel aidream session — a 404 / network failure
// is reported as "resolver not deployed yet", never as a crash.
// Contract: common-docs/remote-catalogs/FEATURE.md

import { createAuthenticatedClient } from "@/lib/api/backend-client";
import { BackendApiError } from "@/lib/api/errors";
import type {
  ResolveLinkResult,
  ResolvedFile,
  ResolverSuggestion,
} from "@/features/admin/catalogs/types";

export type ResolveOutcome =
  | { status: "ok"; result: ResolveLinkResult }
  | { status: "not_deployed"; message: string }
  | { status: "error"; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Tolerant runtime parse of the resolver response — the endpoint is being
 *  built in parallel, so a shape mismatch surfaces as a clear error instead
 *  of an unchecked cast propagating garbage into the editor. */
function parseResolveResult(data: unknown): ResolveLinkResult | null {
  if (!isPlainObject(data)) return null;
  const { source, canonical_url, name } = data;
  if (
    (source !== "huggingface" && source !== "civitai" && source !== "direct") ||
    typeof canonical_url !== "string" ||
    typeof name !== "string"
  ) {
    return null;
  }

  const files: ResolvedFile[] = [];
  if (Array.isArray(data.files)) {
    for (const raw of data.files) {
      if (!isPlainObject(raw)) continue;
      if (
        typeof raw.filename !== "string" ||
        typeof raw.download_url !== "string"
      ) {
        continue;
      }
      files.push({
        filename: raw.filename,
        download_url: raw.download_url,
        size_bytes: asOptionalNumber(raw.size_bytes),
        sha256: asOptionalString(raw.sha256),
        label: asOptionalString(raw.label),
      });
    }
  }

  const suggestions: ResolverSuggestion[] = [];
  if (Array.isArray(data.suggestions)) {
    for (const raw of data.suggestions) {
      if (!isPlainObject(raw)) continue;
      if (
        typeof raw.kind !== "string" ||
        typeof raw.key !== "string" ||
        typeof raw.artifact_url !== "string" ||
        !isPlainObject(raw.payload)
      ) {
        continue;
      }
      suggestions.push({
        kind: raw.kind,
        key: raw.key,
        payload: raw.payload,
        artifact_url: raw.artifact_url,
        artifact_sha256: asOptionalString(raw.artifact_sha256),
        artifact_size_bytes: asOptionalNumber(raw.artifact_size_bytes),
        notes: asOptionalString(raw.notes),
      });
    }
  }

  return {
    source,
    canonical_url,
    name,
    description: asOptionalString(data.description),
    license: asOptionalString(data.license),
    files,
    suggestions,
  };
}

const NOT_DEPLOYED_MESSAGE =
  "The link resolver requires the latest aidream deploy — POST /api/catalog-resolver/resolve is not reachable on the selected server yet.";

export async function resolveCatalogLink(params: {
  baseUrl: string;
  accessToken: string;
  url: string;
  kindHint: string | null;
  signal?: AbortSignal;
}): Promise<ResolveOutcome> {
  const client = createAuthenticatedClient(params.accessToken, params.baseUrl);
  try {
    const data = await client.postJson(
      "/api/catalog-resolver/resolve",
      {
        url: params.url,
        kind_hint: params.kindHint,
      },
      params.signal,
    );
    const result = parseResolveResult(data);
    if (!result) {
      return {
        status: "error",
        message:
          "Resolver responded with an unexpected shape — check that the deployed aidream matches the ratified contract.",
      };
    }
    return { status: "ok", result };
  } catch (err) {
    if (err instanceof BackendApiError) {
      if (err.status === 404) {
        return { status: "not_deployed", message: NOT_DEPLOYED_MESSAGE };
      }
      return {
        status: "error",
        message: `Resolver error (HTTP ${err.status ?? "?"}): ${err.userMessage || err.detail}`,
      };
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "error", message: "Resolve cancelled." };
    }
    // Opaque network failure — server down, DNS, CORS. Treat as not deployed
    // (same admin action either way: deploy/point at a live aidream).
    return { status: "not_deployed", message: NOT_DEPLOYED_MESSAGE };
  }
}
