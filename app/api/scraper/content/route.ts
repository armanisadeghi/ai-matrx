import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { getBackendProxyAuthHeaders } from "@/lib/api/proxy-backend-auth-headers";
import { consumeStream } from "@/lib/api/stream-parser";
import type { ErrorPayload } from "@/lib/api/types";

/**
 * API route to proxy scraper requests to the Python backend.
 * This allows public routes to access the scraper without socket.io.
 *
 * POST /api/scraper/content
 * Body: { url: string }
 *
 * Client must send auth via useApiAuth:
 *   - Authorization: Bearer <token> when signed in
 *   - X-Fingerprint-ID when guest
 *
 * Returns the scraped content with text, overview, and structured data.
 */

interface QuickScrapeRequest {
  urls: string[];
  anchor_size?: number;
  get_content_filter_removal_details?: boolean;
  get_links?: boolean;
  get_main_image?: boolean;
  get_organized_data?: boolean;
  get_overview?: boolean;
  get_structured_data?: boolean;
  get_text_data?: boolean;
  include_anchors?: boolean;
  include_highlighting_markers?: boolean;
  include_media?: boolean;
  include_media_description?: boolean;
  include_media_links?: boolean;
  use_cache?: boolean;
}

type ScrapeRow = Record<string, unknown>;

function isScrapeRowFailed(row: ScrapeRow): boolean {
  return row.success === false || row.status === "error";
}

function scrapeRowError(row: ScrapeRow): string {
  return (
    (row.failure_reason as string) ?? (row.error as string) ?? "Scraping failed"
  );
}

function absorbScrapeDataEvent(
  eventData: ScrapeRow,
  results: ScrapeRow[],
  metadata: Record<string, unknown>,
): { results: ScrapeRow[]; metadata: Record<string, unknown> } {
  if (Array.isArray(eventData.results) && eventData.results.length > 0) {
    return {
      results: eventData.results as ScrapeRow[],
      metadata:
        eventData.metadata && typeof eventData.metadata === "object"
          ? (eventData.metadata as Record<string, unknown>)
          : metadata,
    };
  }

  if (
    "text_data" in eventData ||
    "overview" in eventData ||
    "url" in eventData
  ) {
    return { results: [...results, eventData], metadata };
  }

  return { results, metadata };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    const scrapeUrl = /^https?:\/\//i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    try {
      new URL(scrapeUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    // Get backend URL from single source of truth
    const BACKEND_URL = BACKEND_URLS.production;

    // Forward client auth (Bearer token or guest fingerprint) to Python backend
    const backendHeaders = getBackendProxyAuthHeaders(request, {
      "Content-Type": "application/json",
    });

    const scraperRequest: QuickScrapeRequest = {
      urls: [scrapeUrl],
      anchor_size: 100,
      get_content_filter_removal_details: false,
      get_links: true,
      get_main_image: true,
      get_organized_data: true,
      get_overview: true,
      get_structured_data: true,
      get_text_data: true,
      include_anchors: true,
      include_highlighting_markers: false,
      include_media: true,
      include_media_description: true,
      include_media_links: true,
      use_cache: true,
    };

    const response = await fetch(`${BACKEND_URL}/scraper/quick-scrape`, {
      method: "POST",
      headers: backendHeaders,
      body: JSON.stringify(scraperRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Scraper API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Scraper service error: ${response.status}` },
        { status: response.status },
      );
    }

    // Parse NDJSON stream (fetch_results / scraped_pages data events)
    let results: ScrapeRow[] = [];
    let streamMetadata: Record<string, unknown> = {};
    let streamError: string | null = null;

    await consumeStream(response, {
      onData: (data) => {
        const absorbed = absorbScrapeDataEvent(
          data as ScrapeRow,
          results,
          streamMetadata,
        );
        results = absorbed.results;
        streamMetadata = absorbed.metadata;
      },
      onError: (data: ErrorPayload) => {
        streamError = data.user_message ?? data.message ?? "Scraping failed";
      },
    });

    if (streamError) {
      return NextResponse.json({ error: streamError }, { status: 500 });
    }

    if (!results.length) {
      return NextResponse.json(
        { error: "No data returned from scraper" },
        { status: 500 },
      );
    }

    const firstResult = results[0];

    if (isScrapeRowFailed(firstResult)) {
      return NextResponse.json(
        { error: scrapeRowError(firstResult) },
        { status: 500 },
      );
    }

    // Return the scraped content in a simplified format
    return NextResponse.json({
      url: (firstResult.url as string) || url,
      overview: firstResult.overview || {},
      textContent: (firstResult.text_data as string) || "",
      structuredData: firstResult.structured_data || {},
      organizedData: firstResult.organized_data || {},
      links: firstResult.links || {},
      mainImage: (firstResult.main_image as string) || null,
      scrapedAt: (firstResult.scraped_at as string) || new Date().toISOString(),
      metadata: streamMetadata,
    });
  } catch (error) {
    console.error("Scraper content route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to scrape content",
      },
      { status: 500 },
    );
  }
}
