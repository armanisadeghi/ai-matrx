"use client";

import { useState } from "react";
import { PageSpeedResults } from "./components/PageSpeedResults";
import { usePageSpeedAPI } from "./hooks/usePageSpeedAPI";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Monitor, Smartphone, Zap, Globe } from "lucide-react";
import type { PageSpeedResponse } from "./types";

interface AnalysisResults {
    desktop: PageSpeedResponse | null;
    mobile: PageSpeedResponse | null;
}

// All categories to analyze
const ALL_CATEGORIES = ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"];

export default function PageSpeedInsightsPage() {
    const [results, setResults] = useState<AnalysisResults>({ desktop: null, mobile: null });
    const [activeTab, setActiveTab] = useState<"desktop" | "mobile">("desktop");
    const [url, setUrl] = useState("");
    const { runAnalysis, loading, error } = usePageSpeedAPI();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim() || loading) return;
        
        // Run both desktop and mobile analyses in parallel with all categories
        const [desktopData, mobileData] = await Promise.all([
            runAnalysis(url, "desktop", ALL_CATEGORIES),
            runAnalysis(url, "mobile", ALL_CATEGORIES),
        ]);
        
        setResults({
            desktop: desktopData,
            mobile: mobileData,
        });
        
        // Set active tab to whichever loaded successfully, prefer desktop
        if (desktopData) {
            setActiveTab("desktop");
        } else if (mobileData) {
            setActiveTab("mobile");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
            <div className="space-y-6">
                {/* Header with Full-Width URL Form */}
                <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 p-6 shadow-lg">
                    {/* Title Section */}
                    <div className="flex items-center gap-3 mb-4">
                        <Zap className="w-7 h-7 text-white flex-shrink-0" />
                        <div>
                            <h1 className="text-2xl font-bold text-white">PageSpeed Insights</h1>
                            <p className="text-blue-100 text-xs font-medium">Powered by Google Lighthouse</p>
                        </div>
                    </div>
                    
                    {/* Full-Width URL Form */}
                    <form onSubmit={handleSubmit} className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Enter URL to analyze..."
                                required
                                disabled={loading}
                                className="w-full h-11 pl-10 pr-4 rounded-lg bg-textured border border-white/20 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !url.trim()}
                            className="h-11 px-6 rounded-lg bg-textured text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Monitor className="w-4 h-4" />
                                    <Smartphone className="w-4 h-4" />
                                    Analyze
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Error State */}
                {error && !loading && (
                    <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-800 dark:text-red-200">
                            {error}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Loading State - Compact */}
                {loading && (
                    <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                            <span className="font-medium">Analyzing desktop & mobile...</span>
                        </div>
                    </div>
                )}

                {/* Results - Desktop & Mobile Tabs */}
                {(results.desktop || results.mobile) && !loading && (
                    <>
                        {/* Compact Tabs */}
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "desktop" | "mobile")} className="space-y-4">
                            <TabsList className="grid w-full max-w-md grid-cols-2 bg-textured border-border">
                                <TabsTrigger
                                    value="desktop"
                                    disabled={!results.desktop}
                                    className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                                >
                                    <Monitor className="w-4 h-4" />
                                    Desktop
                                    {results.desktop && (
                                        <Badge variant="outline" className="ml-1 text-xs">
                                            {Math.round((results.desktop.lighthouseResult.categories.performance?.score || 0) * 100)}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="mobile"
                                    disabled={!results.mobile}
                                    className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                                >
                                    <Smartphone className="w-4 h-4" />
                                    Mobile
                                    {results.mobile && (
                                        <Badge variant="outline" className="ml-1 text-xs">
                                            {Math.round((results.mobile.lighthouseResult.categories.performance?.score || 0) * 100)}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="desktop">
                                {results.desktop && <PageSpeedResults data={results.desktop} strategy="desktop" />}
                            </TabsContent>

                            <TabsContent value="mobile">
                                {results.mobile && <PageSpeedResults data={results.mobile} strategy="mobile" />}
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </div>
        </div>
    );
}

