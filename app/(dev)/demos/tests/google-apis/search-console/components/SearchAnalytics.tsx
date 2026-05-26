"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, MousePointer, Eye, BarChart3, FileText, Map, Smartphone, RefreshCw } from "lucide-react";
import { useSearchConsoleAPI } from "../hooks/useSearchConsole";
import { PerformanceMetrics } from "./PerformanceMetrics";
import { DataTable } from "./DataTable";
import { DateRangeSelector } from "./DateRangeSelector";
import type { SiteProperty, SearchAnalyticsResponse, PerformanceSummary, Dimension } from "../types";

interface SearchAnalyticsProps {
    token: string;
    property: SiteProperty;
}

export function SearchAnalytics({ token, property }: SearchAnalyticsProps) {
    const [dateRange, setDateRange] = useState({
        startDate: getDateDaysAgo(28),
        endDate: getDateDaysAgo(1),
    });
    const [queriesData, setQueriesData] = useState<SearchAnalyticsResponse | null>(null);
    const [pagesData, setPagesData] = useState<SearchAnalyticsResponse | null>(null);
    const [countriesData, setCountriesData] = useState<SearchAnalyticsResponse | null>(null);
    const [devicesData, setDevicesData] = useState<SearchAnalyticsResponse | null>(null);
    const [summary, setSummary] = useState<PerformanceSummary | null>(null);
    
    const { fetchAnalytics, loading, error } = useSearchConsoleAPI(token);

    // Don't auto-load on mount or property change
    // User must click "Refresh" or change date range explicitly
    useEffect(() => {
        // Only load when date range changes (user action)
        if (summary !== null) {
            loadAllData();
        }
    }, [dateRange]);

    const loadAllData = async () => {
        // Fetch summary (no dimensions)
        const summaryData = await fetchAnalytics(property.siteUrl, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            rowLimit: 1,
        });

        if (summaryData?.rows && summaryData.rows.length > 0) {
            const row = summaryData.rows[0];
            setSummary({
                totalClicks: row.clicks,
                totalImpressions: row.impressions,
                averageCTR: row.ctr,
                averagePosition: row.position,
            });
        }

        // Fetch queries
        const queries = await fetchAnalytics(property.siteUrl, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            dimensions: ['query'],
            rowLimit: 100,
        });
        setQueriesData(queries);

        // Fetch pages
        const pages = await fetchAnalytics(property.siteUrl, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            dimensions: ['page'],
            rowLimit: 100,
        });
        setPagesData(pages);

        // Fetch countries
        const countries = await fetchAnalytics(property.siteUrl, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            dimensions: ['country'],
            rowLimit: 50,
        });
        setCountriesData(countries);

        // Fetch devices
        const devices = await fetchAnalytics(property.siteUrl, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            dimensions: ['device'],
            rowLimit: 10,
        });
        setDevicesData(devices);
    };

    return (
        <div className="space-y-4">
            {/* Compact Header - Date Range and Load Data Button */}
            <div className="flex items-center justify-end gap-3">
                <DateRangeSelector
                    startDate={dateRange.startDate}
                    endDate={dateRange.endDate}
                    onChange={setDateRange}
                />
                <Button
                    onClick={loadAllData}
                    disabled={loading}
                    size="sm"
                    variant={summary === null ? "default" : "outline"}
                    className={summary === null ? "gap-2 bg-green-600 hover:bg-green-700 text-white" : "gap-2"}
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="w-4 h-4" />
                            {summary === null ? "Load Data" : "Refresh"}
                        </>
                    )}
                </Button>
            </div>

            {/* Performance Metrics */}
            {summary && <PerformanceMetrics summary={summary} loading={loading} />}

            {/* Loading State */}
            {loading && !summary && (
                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                        <Loader2 className="h-5 w-5 animate-spin text-green-600 dark:text-green-400" />
                        <span>Loading analytics data...</span>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                    <CardContent className="pt-6">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                    </CardContent>
                </Card>
            )}

            {/* Data Tables */}
            {!loading && (
                <Tabs defaultValue="queries" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4 bg-textured border-border">
                        <TabsTrigger value="queries" className="gap-2">
                            <BarChart3 className="w-4 h-4" />
                            <span className="hidden sm:inline">Queries</span>
                        </TabsTrigger>
                        <TabsTrigger value="pages" className="gap-2">
                            <FileText className="w-4 h-4" />
                            <span className="hidden sm:inline">Pages</span>
                        </TabsTrigger>
                        <TabsTrigger value="countries" className="gap-2">
                            <Map className="w-4 h-4" />
                            <span className="hidden sm:inline">Countries</span>
                        </TabsTrigger>
                        <TabsTrigger value="devices" className="gap-2">
                            <Smartphone className="w-4 h-4" />
                            <span className="hidden sm:inline">Devices</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="queries">
                        <DataTable
                            data={queriesData}
                            dimension="query"
                            title="Top Queries"
                        />
                    </TabsContent>

                    <TabsContent value="pages">
                        <DataTable
                            data={pagesData}
                            dimension="page"
                            title="Top Pages"
                        />
                    </TabsContent>

                    <TabsContent value="countries">
                        <DataTable
                            data={countriesData}
                            dimension="country"
                            title="Top Countries"
                        />
                    </TabsContent>

                    <TabsContent value="devices">
                        <DataTable
                            data={devicesData}
                            dimension="device"
                            title="Devices"
                        />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

function getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
}

