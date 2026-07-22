import type {
  CollectionCreateBody,
  CollectionReceipt,
  DataForSeoOperationsResponse,
  JsonValue,
  RunEvidence,
} from "./types";

export class SeoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: JsonValue,
  ) {
    super(
      typeof detail === "string"
        ? detail
        : `SEO API request failed with HTTP ${status}`,
    );
  }
}

function normalizedBaseUrl(serverUrl: string): string {
  const value = serverUrl.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Enter a matrx-seo server URL.");
  return value;
}

async function seoRequest<T>(
  serverUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${normalizedBaseUrl(serverUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload.detail as JsonValue)
        : (payload as JsonValue);
    throw new SeoApiError(response.status, detail);
  }
  return payload as T;
}

export async function checkSeoHealth(serverUrl: string): Promise<JsonValue> {
  const response = await fetch(`${normalizedBaseUrl(serverUrl)}/health/ready`);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SeoApiError(response.status, payload as JsonValue);
  }
  return payload as JsonValue;
}

export function listDataForSeoOperations(
  serverUrl: string,
  accessToken: string,
): Promise<DataForSeoOperationsResponse> {
  return seoRequest(serverUrl, accessToken, "/providers/dataforseo/operations");
}

export function createDataForSeoCollection(
  serverUrl: string,
  accessToken: string,
  body: CollectionCreateBody,
): Promise<CollectionReceipt> {
  return seoRequest(serverUrl, accessToken, "/collections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getCollectionEvidence(
  serverUrl: string,
  accessToken: string,
  runId: string,
): Promise<RunEvidence> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/collections/${encodeURIComponent(runId)}/evidence`,
  );
}
