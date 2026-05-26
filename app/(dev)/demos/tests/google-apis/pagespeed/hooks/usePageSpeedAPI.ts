"use client";

import { useState, useCallback } from "react";
import type { PageSpeedResponse, Strategy, Category } from "../types";

const PAGESPEED_API_ENDPOINT = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

export function usePageSpeedAPI() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runAnalysis = useCallback(
        async (
            url: string,
            strategy: Strategy = "desktop",
            categories: string[] = ["PERFORMANCE"]
        ): Promise<PageSpeedResponse | null> => {
            setLoading(true);
            setError(null);

            try {
                // Build query parameters
                const params = new URLSearchParams({
                    url: url,
                    strategy: strategy,
                });

                // Add categories
                categories.forEach((category) => {
                    params.append("category", category);
                });

                // Add API key if available (optional but recommended for higher quota)
                const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
                if (apiKey) {
                    params.append("key", apiKey);
                }

                const response = await fetch(`${PAGESPEED_API_ENDPOINT}?${params.toString()}`);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(
                        errorData.error?.message || 
                        `API request failed with status ${response.status}`
                    );
                }

                const data: PageSpeedResponse = await response.json();
                return data;
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
                setError(errorMessage);
                console.error("PageSpeed API Error:", err);
                return null;
            } finally {
                setLoading(false);
            }
        },
        []
    );

    return {
        runAnalysis,
        loading,
        error,
    };
}

