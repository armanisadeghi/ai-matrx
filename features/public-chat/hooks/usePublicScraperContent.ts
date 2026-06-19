"use client";

import { useState, useCallback } from "react";
import { useApiAuth } from "@/hooks/useApiAuth";

/**
 * Response from the scraper API route
 */
interface ScraperApiResponse {
  url: string;
  overview: {
    page_title?: string;
    url?: string;
    website?: string;
    char_count?: number;
    has_structured_content?: boolean;
    outline?: Record<string, string[]>;
    [key: string]: unknown;
  };
  textContent: string;
  structuredData: object;
  organizedData: object;
  links: {
    internal?: string[];
    external?: string[];
    images?: string[];
    documents?: string[];
    others?: string[];
    audio?: string[];
    videos?: string[];
    archives?: string[];
  };
  mainImage: string | null;
  scrapedAt: string;
  metadata: {
    execution_time_ms?: number;
  };
}

/**
 * Scraped content result matching the socket.io hook interface
 */
export interface PublicScraperContentResult {
  // Text content (primary)
  textContent: string;

  // Other commonly used data
  organizedData: object;
  structuredData: object;
  overview: {
    page_title?: string;
    url?: string;
    website?: string;
    char_count?: number;
    has_structured_content?: boolean;
    outline?: Record<string, string[]>;
    [key: string]: unknown;
  };
  links: {
    internal?: string[];
    external?: string[];
    images?: string[];
    documents?: string[];
    others?: string[];
    audio?: string[];
    videos?: string[];
    archives?: string[];
  };
  images: string[];
  mainImage: string | null;

  // Additional useful data
  metadata: {
    execution_time_ms?: number | null;
  };
  scrapedAt: string;

  // Raw API response for custom access
  rawResponse: ScraperApiResponse;
}

interface UsePublicScraperContentReturn {
  // Main data
  data: PublicScraperContentResult | null;

  // State flags
  isLoading: boolean;
  isCompleted: boolean;
  hasError: boolean;
  error: string | null;

  // Control methods
  scrapeUrl: (url: string) => Promise<PublicScraperContentResult>;
  reset: () => void;
}

/**
 * A hook for scraping URLs using the REST API.
 * This is the public equivalent of useScraperContent which uses socket.io.
 *
 * This hook provides the same interface as useScraperContent but uses
 * the /api/scraper/content REST endpoint instead of socket.io.
 *
 * @example
 * ```tsx
 * const { scrapeUrl, data, isLoading, hasError } = usePublicScraperContent();
 *
 * const handleScrape = async () => {
 *   await scrapeUrl("https://example.com");
 * };
 *
 * // Access the text content
 * const textContent = data?.textContent;
 * ```
 */
export function usePublicScraperContent(): UsePublicScraperContentReturn {
  const { getHeaders, waitForAuth } = useApiAuth();
  const [data, setData] = useState<PublicScraperContentResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrapeUrl = useCallback(
    async (url: string) => {
      setIsLoading(true);
      setIsCompleted(false);
      setError(null);
      setData(null);

      try {
        await waitForAuth();
        const response = await fetch("/api/scraper/content", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to scrape webpage (${response.status})`,
          );
        }

        const apiResponse: ScraperApiResponse = await response.json();

        // Transform API response to match the expected interface
        const result: PublicScraperContentResult = {
          textContent: apiResponse.textContent || "",
          organizedData: apiResponse.organizedData || {},
          structuredData: apiResponse.structuredData || {},
          overview: apiResponse.overview || {},
          links: apiResponse.links || {},
          images: apiResponse.links?.images || [],
          mainImage: apiResponse.mainImage || null,
          metadata: apiResponse.metadata || {},
          scrapedAt: apiResponse.scrapedAt || new Date().toISOString(),
          rawResponse: apiResponse,
        };

        setData(result);
        setIsCompleted(true);
        return result;
      } catch (err) {
        console.error("[usePublicScraperContent] Error scraping URL:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to scrape URL";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [getHeaders, waitForAuth],
  );

  const reset = useCallback(() => {
    setData(null);
    setIsLoading(false);
    setIsCompleted(false);
    setError(null);
  }, []);

  return {
    data,
    isLoading,
    isCompleted,
    hasError: !!error,
    error,
    scrapeUrl,
    reset,
  };
}

export type UsePublicScraperContent = ReturnType<
  typeof usePublicScraperContent
>;
