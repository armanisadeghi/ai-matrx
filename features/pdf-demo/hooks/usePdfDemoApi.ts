"use client";

/**
 * usePdfDemoApi — typed fetch helpers for every PDF endpoint.
 *
 * Wraps the auth + base-URL boilerplate so each demo route can call:
 *
 *   const api = usePdfDemoApi();
 *   const { blob, filename } = await api.postPdfBlob('renderPage', { ... });
 *   const json = await api.postJson<RepeatedRegionsReport>('detectRepeatedRegions', { ... });
 *
 * Returns blob+headers for binary endpoints (PDF / image / ZIP) and the
 * typed JSON shape for JSON endpoints. Errors raise so callers can show
 * them with their own toast/error UI.
 *
 * No manual useMemo / useCallback — the React Compiler handles memoization.
 */

import { useApiAuth } from "@/hooks/useApiAuth";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { ENDPOINTS } from "@/lib/api/endpoints";

type PdfEndpoint = typeof ENDPOINTS.pdf;
type PdfEndpointKey = {
  [K in keyof PdfEndpoint]: PdfEndpoint[K] extends string ? K : never;
}[keyof PdfEndpoint];

export interface BinaryResult {
  /** Body as a Blob — content-type is preserved on the Blob. */
  blob: Blob;
  /** Filename parsed from `Content-Disposition`, else a sensible default. */
  filename: string;
  /** Response `Content-Type` header. */
  contentType: string;
}

export interface PdfDemoApi {
  backendUrl: string;
  postJson: <T = unknown>(
    endpoint: PdfEndpointKey,
    body: unknown,
  ) => Promise<T>;
  postPdfBlob: (
    endpoint: PdfEndpointKey,
    body: unknown,
  ) => Promise<BinaryResult>;
  getJson: <T = unknown>(endpoint: PdfEndpointKey) => Promise<T>;
  /** Build an absolute URL for the given endpoint key — useful when you need
   * to manually fetch (e.g. multipart, streaming). */
  buildUrl: (endpoint: PdfEndpointKey | (string & {})) => string;
}

const FILENAME_RE = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i;

function parseFilename(headerValue: string | null, fallback: string): string {
  if (!headerValue) return fallback;
  const match = FILENAME_RE.exec(headerValue);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1].replace(/^"|"$/g, ""));
  } catch {
    return match[1];
  }
}

function endpointPath(key: PdfEndpointKey | (string & {})): string {
  const fromTable = (ENDPOINTS.pdf as Record<string, unknown>)[key as string];
  if (typeof fromTable === "string") return fromTable;
  if (typeof key === "string" && key.startsWith("/")) return key;
  throw new Error(`Unknown PDF endpoint: ${String(key)}`);
}

export function usePdfDemoApi(): PdfDemoApi {
  const backendUrl = useAppSelector(selectResolvedBaseUrl);
  const { getHeaders, waitForAuth } = useApiAuth();

  function buildUrl(endpoint: PdfEndpointKey | (string & {})): string {
    return `${backendUrl}${endpointPath(endpoint)}`;
  }

  async function jsonHeaders(): Promise<Record<string, string>> {
    await waitForAuth();
    const headers = getHeaders() as Record<string, string>;
    return { "Content-Type": "application/json", ...headers };
  }

  async function postJson<T = unknown>(
    endpoint: PdfEndpointKey,
    body: unknown,
  ): Promise<T> {
    const headers = await jsonHeaders();
    const response = await fetch(buildUrl(endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(
        `POST ${endpoint} → ${response.status}: ${detail.slice(0, 600)}`,
      );
    }
    return (await response.json()) as T;
  }

  async function postPdfBlob(
    endpoint: PdfEndpointKey,
    body: unknown,
  ): Promise<BinaryResult> {
    const headers = await jsonHeaders();
    const response = await fetch(buildUrl(endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(
        `POST ${endpoint} → ${response.status}: ${detail.slice(0, 600)}`,
      );
    }
    const blob = await response.blob();
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const filename = parseFilename(
      response.headers.get("content-disposition"),
      String(endpoint).replace(/[^a-z0-9]/gi, "_"),
    );
    return { blob, filename, contentType };
  }

  async function getJson<T = unknown>(
    endpoint: PdfEndpointKey,
  ): Promise<T> {
    await waitForAuth();
    const headers = getHeaders() as Record<string, string>;
    const response = await fetch(buildUrl(endpoint), {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(
        `GET ${endpoint} → ${response.status}: ${detail.slice(0, 600)}`,
      );
    }
    return (await response.json()) as T;
  }

  return { backendUrl, postJson, postPdfBlob, getJson, buildUrl };
}
