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

  /**
   * Turn a non-OK response into a readable Error. Understands both the
   * aidream error envelope ({error, message, user_message, details}) and
   * FastAPI 422 validation bodies ({detail: [{loc, msg}, …]}) — the
   * previous flat `.text().slice(0, 600)` truncated exactly the part of a
   * 422 that says which field was wrong.
   */
  async function errorFromResponse(
    label: string,
    response: Response,
  ): Promise<Error> {
    const raw = await response.text().catch(() => response.statusText);
    let detail = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.detail)) {
          detail = obj.detail
            .map((d) => {
              const item = d as { loc?: unknown[]; msg?: string };
              const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
              return loc ? `${loc}: ${item.msg ?? ""}` : (item.msg ?? "");
            })
            .filter(Boolean)
            .join("; ");
        } else {
          detail = String(
            obj.user_message ?? obj.message ?? obj.detail ?? raw,
          );
        }
      }
    } catch {
      // not JSON — keep raw text
    }
    return new Error(
      `${label} → ${response.status}: ${detail.slice(0, 2000)}`,
    );
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
      throw await errorFromResponse(`POST ${endpoint}`, response);
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
      throw await errorFromResponse(`POST ${endpoint}`, response);
    }
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    // A JSON body on a binary endpoint is an envelope/error, not a file —
    // previously it was silently wrapped in a Blob and "downloaded" as a
    // corrupt PDF.
    if (contentType.includes("application/json")) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `POST ${endpoint} → expected binary, got JSON: ${text.slice(0, 2000)}`,
      );
    }
    const blob = await response.blob();
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
      throw await errorFromResponse(`GET ${endpoint}`, response);
    }
    return (await response.json()) as T;
  }

  return { backendUrl, postJson, postPdfBlob, getJson, buildUrl };
}
