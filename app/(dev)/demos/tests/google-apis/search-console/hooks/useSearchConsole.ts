"use client";

import { useState, useCallback } from "react";
import type { SiteProperty, SearchAnalyticsResponse, SearchAnalyticsRequest } from "../types";

const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";

export function useSearchConsoleAPI(token: string) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchProperties = useCallback(async (): Promise<SiteProperty[]> => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch properties: ${response.statusText}`);
            }

            const data = await response.json();
            return data.siteEntry || [];
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to fetch properties";
            setError(errorMessage);
            console.error("Search Console API Error:", err);
            return [];
        } finally {
            setLoading(false);
        }
    }, [token]);

    const fetchAnalytics = useCallback(
        async (
            siteUrl: string,
            request: SearchAnalyticsRequest
        ): Promise<SearchAnalyticsResponse | null> => {
            setLoading(true);
            setError(null);

            try {
                const encodedUrl = encodeURIComponent(siteUrl);
                const response = await fetch(
                    `${SEARCH_CONSOLE_API_BASE}/sites/${encodedUrl}/searchAnalytics/query`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(request),
                    }
                );

                if (!response.ok) {
                    throw new Error(`Failed to fetch analytics: ${response.statusText}`);
                }

                const data = await response.json();
                return data;
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Failed to fetch analytics";
                setError(errorMessage);
                console.error("Search Analytics API Error:", err);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [token]
    );

    return {
        fetchProperties,
        fetchAnalytics,
        loading,
        error,
    };
}

