// File: features/workflows/results/registered-components/SitemapViewer.tsx
"use client";

import React, { useMemo } from "react";
import { Link, FileText, FolderTree, TestTube, ExternalLink } from "lucide-react";
import { Card, Grid } from "@/components/official/PageTemplate";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DbFunctionNode } from "@/features/workflows/types";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { useRouter } from "next/navigation";

interface SitemapData {
    success: boolean;
    sitemap_links: string[];
    links: {
        [subdomain: string]: string[];
    };
    error: string | null;
    execution_time_ms: number;
}

interface ViewerProps {
    nodeData: DbFunctionNode;
    brokerId?: string;
    keyToDisplay?: string;
}

const SitemapViewer: React.FC<ViewerProps> = ({ nodeData, brokerId, keyToDisplay }) => {
    const router = useRouter();
    const [activeTab, setActiveTab] = React.useState("sitemaps");

    if (!brokerId) {
        brokerId = nodeData?.return_broker_overrides[0];
    }

    const rawData = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const handleTestPageNavigation = () => {
        router.push("/registered-results/sitemap-viewer");
    };

    const handleTestPageNewTab = () => {
        window.open("/registered-results/sitemap-viewer", "_blank");
    };

    const data: SitemapData = useMemo(() => {
        if (!keyToDisplay) {
            return rawData;
        }
        return rawData?.[keyToDisplay];
    }, [rawData, keyToDisplay]);

    const domain = useMemo(() => {
        if (data?.sitemap_links && data?.sitemap_links.length > 0) {
            try {
                const url = new URL(data?.sitemap_links[0]);
                return url.hostname;
            } catch {
                return "Unknown Domain";
            }
        }
        return "Unknown Domain";
    }, [data?.sitemap_links]);

    // Calculate stats
    const totalPages = useMemo(() => {
        return Object.values(data?.links || {}).reduce((total, urls) => total + urls.length, 0);
    }, [data?.links]);

    const totalSitemaps = data?.sitemap_links?.length || 0;
    const subdomainCount = Object.keys(data?.links || {}).length;

    // Group URLs by path structure for routes view
    const routeStructure = useMemo(() => {
        const structure: { [key: string]: string[] } = {};

        Object.values(data?.links || {})
            .flat()
            .forEach((url) => {
                try {
                    const urlObj = new URL(url);
                    const pathParts = urlObj.pathname.split("/").filter((part) => part.length > 0);

                    if (pathParts.length === 0) {
                        // Root page
                        if (!structure["Root"]) structure["Root"] = [];
                        structure["Root"].push(url);
                    } else {
                        // Group by first path segment
                        const firstSegment = pathParts[0];
                        const key = `/${firstSegment}`;
                        if (!structure[key]) structure[key] = [];
                        structure[key].push(url);
                    }
                } catch {
                    // Invalid URL, add to miscellaneous
                    if (!structure["Other"]) structure["Other"] = [];
                    structure["Other"].push(url);
                }
            });

        return structure;
    }, [data?.links]);

    // Stats for hero section
    const statsItems = [
        { label: "Sitemaps", value: totalSitemaps },
        { label: "Total Pages", value: totalPages.toLocaleString() },
        { label: "Subdomains", value: subdomainCount },
    ];

    // Sitemaps overview tab
    const SitemapsContent = () => (
        <Grid cols={1} gap="medium">
            <div>
                <div className="space-y-3">
                    {data?.sitemap_links?.map((sitemapUrl, index) => {
                        const filename = sitemapUrl.split("/").pop() || sitemapUrl;
                        return (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border-border"
                            >
                                <div className="flex items-center">
                                    <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-3" />
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{filename}</span>
                                </div>
                                <a
                                    href={sitemapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm underline"
                                >
                                    View
                                </a>
                            </div>
                        );
                    })}
                </div>
            </div>

            {subdomainCount > 1 && (
                <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(data?.links || {}).map(([subdomain, urls]) => (
                            <div
                                key={subdomain}
                                className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border-border"
                            >
                                <div className="font-medium text-gray-800 dark:text-gray-200 mb-1">
                                    {subdomain === "@" ? "Main Domain" : subdomain}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">{urls.length.toLocaleString()} pages</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Grid>
    );

    // All pages tab
    const PagesContent = () => (
        <Grid cols={1} gap="medium">
            {Object.entries(data?.links || {}).map(([subdomain, urls]) => (
                <div key={subdomain} className="h-full">
                    <div className="h-full">
                        {urls.map((url, index) => {
                            const displayUrl = url.replace(/^https?:\/\//, "");
                            return (
                                <div
                                    key={index}
                                    className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded border-border"
                                >
                                    <div className="flex items-center min-w-0 flex-1">
                                        <Link className="h-3 w-3 text-gray-400 mr-2 flex-shrink-0" />
                                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{displayUrl}</span>
                                    </div>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs underline flex-shrink-0"
                                    >
                                        Visit
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </Grid>
    );

    // Routes structure tab
    const RoutesContent = () => (
        <div>
            <Accordion type="multiple" className="w-full">
                {Object.entries(routeStructure)
                    .sort(([a], [b]) => {
                        // Sort Root first, then alphabetically
                        if (a === "Root") return -1;
                        if (b === "Root") return 1;
                        return a.localeCompare(b);
                    })
                    .map(([route, urls]) => (
                        <AccordionItem key={route} value={route} className="border-b border-border">
                            <AccordionTrigger className="hover:no-underline py-3">
                                <div className="flex items-center">
                                    <FolderTree className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                                    <span className="font-medium text-gray-800 dark:text-gray-200">
                                        {route === "Root" ? "/ (Root)" : route}
                                    </span>
                                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({urls.length})</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-3">
                                <div className="space-y-1 pl-6">
                                    {urls.slice(0, 50).map((url, index) => {
                                        const displayUrl = url.replace(/^https?:\/\/[^\/]+/, "") || "/";
                                        return (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded text-xs"
                                            >
                                                <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{displayUrl}</span>
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex-shrink-0"
                                                >
                                                    Visit
                                                </a>
                                            </div>
                                        );
                                    })}
                                    {urls.length > 50 && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 p-2">
                                            ... and {urls.length - 50} more pages
                                        </div>
                                    )}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
            </Accordion>
        </div>
    );

    // Define tabs
    const tabs = [
        {
            id: "sitemaps",
            label: "Sitemaps",
            icon: FileText,
            content: <SitemapsContent />,
        },
        {
            id: "pages",
            label: "All Pages",
            icon: Link,
            content: <PagesContent />,
        },
        {
            id: "routes",
            label: "Site Structure",
            icon: FolderTree,
            content: <RoutesContent />,
        },
    ];

    // Error state
    if (!data?.success && data?.error) {
        return (
            <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
                <div className="max-w-full px-2 sm:px-4 lg:px-6 py-4">
                    <Card title="Error">
                        <div className="text-red-500 p-4">{data?.error}</div>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
            <div className="max-w-full px-2 sm:px-4 lg:px-6 py-4">
                {/* Hero section with custom button */}
                <div className="mb-8 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-xl overflow-hidden">
                    <div className="px-3 py-4 sm:px-6 sm:py-8 relative rounded-2xl">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-indigo-700/30 backdrop-blur-sm rounded-2xl"></div>
                        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between">
                            <div className="mb-6 md:mb-0">
                                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white mb-4 leading-tight">
                                    Sitemap Viewer
                                </h1>
                                <p className="text-white/90 text-base font-medium mb-2">{domain}</p>
                            </div>

                            <div className="flex items-center space-x-3 flex-wrap gap-y-3">
                                {/* Stats */}
                                {statsItems.map((stat, index) => (
                                    <div key={index} className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center">
                                        <div className="text-white/80 text-sm font-medium mb-1">{stat.label}</div>
                                        <div className="text-white text-2xl font-bold">{stat.value}</div>
                                    </div>
                                ))}

                                {/* Full Screen Button with Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <div className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center cursor-pointer hover:bg-white/20 transition-all duration-200 shadow-lg">
                                            <div className="text-white/80 text-sm font-medium mb-1">Actions</div>
                                            <div className="text-white text-lg font-bold flex items-center justify-center">
                                                <ExternalLink className="h-4 w-4 mr-2" />
                                                Full Screen
                                            </div>
                                        </div>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="bg-textured border-border">
                                        <DropdownMenuItem
                                            onClick={handleTestPageNavigation}
                                            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            <TestTube className="h-4 w-4 mr-2" />
                                            Open Full Screen
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={handleTestPageNewTab}
                                            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            <ExternalLink className="h-4 w-4 mr-2" />
                                            Open in New Tab
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-3 flex space-x-1 overflow-x-auto pb-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-3 rounded-lg flex items-center font-medium transition-all duration-200 ${
                                activeTab === tab.id
                                    ? "bg-indigo-600 text-white shadow-md"
                                    : "bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
                            }`}
                        >
                            <tab.icon className="mr-2 h-5 w-5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Main content */}
                {tabs.map((tab) => (
                    <div key={tab.id} className={activeTab === tab.id ? "block" : "hidden"}>
                        {tab.content}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default React.memo(SitemapViewer);
