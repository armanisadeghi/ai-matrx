"use client";

/**
 * features/pdf/api/client.ts — THE canonical PDF API client.
 *
 * One typed transport for every /utilities/pdf/* call, shared by every
 * surface (extractor studio, Analysis Studio panels, demos, future UIs).
 * Folds the best of the three previous parallel layers:
 *   - usePdfDemoApi's endpoint typing + Content-Disposition filename parse
 *     + 422-aware error mapper (kept verbatim — it was the best one)
 *   - backend-client's auth/header discipline (via useApiAuth)
 *   - binary/JSON discrimination with a content-type guard so a JSON error
 *     can never masquerade as a PDF blob
 *
 * Sources are built ONLY with buildPdfSource/buildSecondSource
 * (features/pdf/utils/source.ts) — the keystone contract (`media.file_id`).
 *
 * usePdfDemoApi now re-exports this hook; new code imports from here.
 */

import { useApiAuth } from "@/hooks/useApiAuth";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { ENDPOINTS } from "@/lib/api/endpoints";

type PdfEndpoint = typeof ENDPOINTS.pdf;
export type PdfEndpointKey = {
  [K in keyof PdfEndpoint]: PdfEndpoint[K] extends string ? K : never;
}[keyof PdfEndpoint];

export interface PdfBinaryResult {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface PdfClient {
  backendUrl: string | undefined;
  postJson: <T = unknown>(
    endpoint: PdfEndpointKey,
    body: unknown,
  ) => Promise<T>;
  postPdfBlob: (
    endpoint: PdfEndpointKey,
    body: unknown,
  ) => Promise<PdfBinaryResult>;
  getJson: <T = unknown>(endpoint: PdfEndpointKey) => Promise<T>;
  /** Absolute URL for an endpoint key (or raw path) — for multipart/stream callers. */
  buildUrl: (endpoint: PdfEndpointKey | (string & {})) => string;
  /** Auth headers for callers that need raw fetch (multipart, NDJSON streams). */
  authHeaders: () => Promise<Record<string, string>>;
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

/** Readable Error from a non-OK response — understands the aidream envelope
 *  AND FastAPI 422 bodies (field-level messages survive). */
export async function pdfErrorFromResponse(
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
        detail = String(obj.user_message ?? obj.message ?? obj.detail ?? raw);
      }
    }
  } catch {
    // not JSON — keep raw text
  }
  return new Error(`${label} → ${response.status}: ${detail.slice(0, 2000)}`);
}

export function usePdfClient(): PdfClient {
  const backendUrl = useAppSelector(selectResolvedBaseUrl);
  const { getHeaders, waitForAuth } = useApiAuth();

  function endpointPath(key: PdfEndpointKey | (string & {})): string {
    const fromTable = (ENDPOINTS.pdf as Record<string, unknown>)[key as string];
    if (typeof fromTable === "string") return fromTable;
    if (typeof key === "string" && key.startsWith("/")) return key;
    throw new Error(`Unknown PDF endpoint: ${String(key)}`);
  }

  function buildUrl(endpoint: PdfEndpointKey | (string & {})): string {
    return `${backendUrl}${endpointPath(endpoint)}`;
  }

  async function authHeaders(): Promise<Record<string, string>> {
    await waitForAuth();
    return getHeaders() as Record<string, string>;
  }

  async function jsonHeaders(): Promise<Record<string, string>> {
    return { "Content-Type": "application/json", ...(await authHeaders()) };
  }

  async function postJson<T = unknown>(
    endpoint: PdfEndpointKey,
    body: unknown,
  ): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: "POST",
      headers: await jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await pdfErrorFromResponse(`POST ${endpoint}`, response);
    }
    return (await response.json()) as T;
  }

  async function postPdfBlob(
    endpoint: PdfEndpointKey,
    body: unknown,
  ): Promise<PdfBinaryResult> {
    const response = await fetch(buildUrl(endpoint), {
      method: "POST",
      headers: await jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await pdfErrorFromResponse(`POST ${endpoint}`, response);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      // A JSON body on a blob endpoint = persist-mode envelope or an error
      // that slipped through with 200 — never hand it to the user as a PDF.
      throw await pdfErrorFromResponse(
        `POST ${endpoint} (expected binary)`,
        response,
      );
    }
    const blob = await response.blob();
    return {
      blob,
      filename: parseFilename(
        response.headers.get("content-disposition"),
        `${String(endpoint)}.pdf`,
      ),
      contentType,
    };
  }

  async function getJson<T = unknown>(endpoint: PdfEndpointKey): Promise<T> {
    const response = await fetch(buildUrl(endpoint), {
      method: "GET",
      headers: await authHeaders(),
    });
    if (!response.ok) {
      throw await pdfErrorFromResponse(`GET ${endpoint}`, response);
    }
    return (await response.json()) as T;
  }

  return { backendUrl, postJson, postPdfBlob, getJson, buildUrl, authHeaders };
}
