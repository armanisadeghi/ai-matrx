import type {
  BrokenLinkProspectingBody,
  BrokenLinkProspectingPreview,
  BrokenLinkProspectingReport,
  ProspectImportBody,
  ProspectImportPreview,
  ProspectImportReport,
  BacklinkRefreshBody,
  BacklinkRefreshReceipt,
  BacklinkEnrichmentResult,
  BacklinkEnrichmentBody,
  PageLinkGapBody,
  PageLinkGapReceipt,
  CollectionCreateBody,
  CollectionReceipt,
  DataForSeoOperationsResponse,
  DomainLinkGapReceipt,
  JsonValue,
  LinkGapFoldReport,
  RunEvidence,
  SeoStreamEvent,
  SerpProspectingBody,
  SerpProspectingPreview,
  SerpProspectingReceipt,
  SiteLinkGapBody,
  SiteLinkGapSeedResponse,
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

async function seoStreamTerminal<T>(
  serverUrl: string,
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
  terminalKind: string,
  project: (data: Record<string, unknown>) => T | null,
  onEvent?: (event: SeoStreamEvent) => void,
  /**
   * Abort the CLIENT's read of the stream (the server run is durable and keeps
   * going). Without it, leaving the page left the response body draining for
   * the life of a multi-minute run.
   */
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${normalizedBaseUrl(serverUrl)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload.detail as JsonValue)
        : (payload as JsonValue);
    throw new SeoApiError(response.status, detail);
  }
  if (!response.body) throw new Error("SEO server returned no command stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;
  let streamError: string | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const envelope = JSON.parse(line) as Record<string, unknown>;
    const data =
      envelope.data && typeof envelope.data === "object"
        ? (envelope.data as Record<string, unknown>)
        : envelope;
    if (typeof data.kind === "string") onEvent?.(data as SeoStreamEvent);
    if (data.kind === terminalKind) result = project(data);
    if (data.kind === "seo.command_failed" || envelope.event === "error") {
      streamError = JSON.stringify(data.error ?? data);
    }
  };
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
      stream: !chunk.done,
    });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      consumeLine(line);
    }
    if (chunk.done) break;
  }
  consumeLine(buffer);
  if (streamError) throw new Error(streamError);
  if (result === null)
    throw new Error(`SEO command ended without ${terminalKind}.`);
  return result;
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

/** Trigger the canonical multi-dataset backlink refresh for one managed site. */
export function refreshSiteBacklinks(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: BacklinkRefreshBody,
): Promise<BacklinkRefreshReceipt> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/backlinks/refresh`,
    { ...body },
    "seo.backlink_refresh_completed",
    (data) => (data.receipt as BacklinkRefreshReceipt | undefined) ?? null,
  );
}

export function enrichSiteBacklinks(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: BacklinkEnrichmentBody,
  onEvent?: (event: SeoStreamEvent) => void,
): Promise<BacklinkEnrichmentResult> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/backlinks/enrich`,
    { ...body },
    "seo.backlink_enrichment_completed",
    (data) => (data.result as BacklinkEnrichmentResult | undefined) ?? null,
    onEvent,
  );
}

/**
 * Who WOULD be compared, before anyone spends money. No provider call, no
 * rows written — the seed is the honest preview of the paid run below, so the
 * user sees the competitor list (and the confirmed ones left out, with the
 * reason) before choosing to pay.
 */
export function previewSiteLinkGapSeed(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: SiteLinkGapBody,
): Promise<SiteLinkGapSeedResponse> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/link-gap/seed`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * The paid site-wide run: every domain that links to a confirmed competitor
 * and not to us. Refused with HTTP 409 (a sentence written for the user) when
 * the site has no confirmed, link-gap-eligible competitor — render that as
 * guidance to the competitors workspace, never as a raw failure.
 */
export function collectSiteLinkGap(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: SiteLinkGapBody,
  onEvent?: (event: SeoStreamEvent) => void,
  signal?: AbortSignal,
): Promise<DomainLinkGapReceipt> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/link-gap`,
    { ...body },
    "seo.site_link_gap_completed",
    (data) => (data.receipt as DomainLinkGapReceipt | undefined) ?? null,
    onEvent,
    signal,
  );
}

/**
 * THE OUTREACH DOOR (contract IC-1): resolve this site's APPROVED prospects
 * into `crm.party` organizations, each carrying a provenance edge naming the
 * competitors that already get links from that site.
 *
 * The SAME route the automatic per-site fold runs, so the manual click and the
 * schedule can never produce two different kinds of record. Approval is the
 * only gate — the server refuses everything else and says so per row.
 */
export function foldLinkGapDomainsToCrm(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: { limit?: number; refold?: boolean } = {},
): Promise<LinkGapFoldReport> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/crm/link-gap-domains`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * The SECOND prospecting method's free preview: every query the run would
 * send (per keyword, per variant) plus the estimated provider cost. No
 * provider call, no rows written — the user sees exactly what would be
 * searched and what it would cost BEFORE choosing to pay. HTTP 400 carries a
 * sentence about the input (too many keywords, nothing usable) — render it
 * inline at the form, never as a toast-only failure.
 */
export function previewSerpProspecting(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: SerpProspectingBody,
): Promise<SerpProspectingPreview> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/serp-prospecting/preview`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * The paid SERP prospecting run: search every expanded query, fold the
 * results into `seo.serp_opportunity` rows with per-query mention evidence,
 * then bulk-measure authority so the triage list lands scored. Same review +
 * CRM-fold path as the competitor link gap — one triage surface.
 */
export function collectSerpProspects(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: SerpProspectingBody,
  onEvent?: (event: SeoStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SerpProspectingReceipt> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/serp-prospecting`,
    { ...body },
    "seo.serp_prospecting_completed",
    (data) => (data.receipt as SerpProspectingReceipt | undefined) ?? null,
    onEvent,
    signal,
  );
}

/**
 * THE OUTREACH DOOR for SERP prospects: resolve this site's APPROVED
 * `seo.serp_opportunity` rows into `crm.party` organizations — the same fold
 * contract as `foldLinkGapDomainsToCrm`, and the same rule: approval is the
 * only gate, everything else comes back in `skipped` with its reason.
 */
export function foldSerpProspectsToCrm(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: { limit?: number; refold?: boolean } = {},
): Promise<LinkGapFoldReport> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/crm/serp-prospects`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * What a broken-link pass would open, before it opens anything. Free — no
 * provider call — but crawling other people's pages is a real cost to them, so
 * the count is shown first, and an empty run explains what to do instead.
 */
export function previewBrokenLinkProspecting(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: BrokenLinkProspectingBody = {},
): Promise<BrokenLinkProspectingPreview> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/broken-link-prospecting/preview`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * Run the broken-link pass: open the candidate pages, check every outbound
 * link, and record the dead ones against the prospect that carries them.
 * Resumable — each page's evidence is written the moment it is checked, so a
 * disconnect costs a delay, never a page.
 */
export function collectBrokenLinkProspects(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: BrokenLinkProspectingBody = {},
  onEvent?: (event: SeoStreamEvent) => void,
  signal?: AbortSignal,
): Promise<BrokenLinkProspectingReport> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/broken-link-prospecting`,
    { ...body },
    "seo.broken_link_prospecting_completed",
    (data) => (data.receipt as BrokenLinkProspectingReport | undefined) ?? null,
    onEvent,
    signal,
  );
}

/**
 * A real dry-run of a pasted/imported list: every entry comes back with a
 * verdict (`new` / `existing` / `duplicate_in_list` / `blocklisted` /
 * `unusable`) and a sentence, plus the flat price of scoring what is new.
 * Nothing is written.
 */
export function previewProspectImport(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: ProspectImportBody,
): Promise<ProspectImportPreview> {
  return seoRequest(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/prospect-import/preview`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * Commit the list into the SAME triage surface every other method feeds. The
 * blocklist is enforced at ingestion, so a forbidden domain never arrives.
 */
export function runProspectImport(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  body: ProspectImportBody,
  onEvent?: (event: SeoStreamEvent) => void,
  signal?: AbortSignal,
): Promise<ProspectImportReport> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/prospect-import`,
    { ...body },
    "seo.prospect_import_completed",
    (data) => (data.receipt as ProspectImportReport | undefined) ?? null,
    onEvent,
    signal,
  );
}

export function collectPageLinkGap(
  serverUrl: string,
  accessToken: string,
  siteId: string,
  pageId: string,
  body: PageLinkGapBody,
  onEvent?: (event: SeoStreamEvent) => void,
): Promise<PageLinkGapReceipt> {
  return seoStreamTerminal(
    serverUrl,
    accessToken,
    `/seo/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}/link-gap`,
    { ...body },
    "seo.page_link_gap_completed",
    (data) => (data.receipt as PageLinkGapReceipt | undefined) ?? null,
    onEvent,
  );
}
