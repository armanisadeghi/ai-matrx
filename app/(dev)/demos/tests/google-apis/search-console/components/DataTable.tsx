"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Copy, Filter } from "lucide-react";
import type { SearchAnalyticsResponse, Dimension, SearchAnalyticsRow } from "../types";

interface DataTableProps {
    data: SearchAnalyticsResponse | null;
    dimension: Dimension;
    title: string;
}

type SortField = 'name' | 'clicks' | 'impressions' | 'ctr' | 'position';
type SortDirection = 'asc' | 'desc';

export function DataTable({ data, dimension, title }: DataTableProps) {
    const [sortField, setSortField] = useState<SortField>('clicks');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);
    const [copiedText, setCopiedText] = useState<string | null>(null);

    // Sort data
    const sortedRows = useMemo(() => {
        if (!data || !data.rows || data.rows.length === 0) return [];

        const rows = [...data.rows];
        
        rows.sort((a, b) => {
            let aValue: number | string;
            let bValue: number | string;

            switch (sortField) {
                case 'name':
                    aValue = (a.keys?.[0] || '').toLowerCase();
                    bValue = (b.keys?.[0] || '').toLowerCase();
                    break;
                case 'clicks':
                    aValue = a.clicks;
                    bValue = b.clicks;
                    break;
                case 'impressions':
                    aValue = a.impressions;
                    bValue = b.impressions;
                    break;
                case 'ctr':
                    aValue = a.ctr;
                    bValue = b.ctr;
                    break;
                case 'position':
                    aValue = a.position;
                    bValue = b.position;
                    break;
                default:
                    return 0;
            }

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'asc' 
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            return sortDirection === 'asc' 
                ? (aValue as number) - (bValue as number)
                : (bValue as number) - (aValue as number);
        });

        return rows;
    }, [data, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'position' ? 'asc' : 'desc'); // Position is better when lower
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />;
        }
        return sortDirection === 'asc' 
            ? <ArrowUp className="w-3.5 h-3.5" />
            : <ArrowDown className="w-3.5 h-3.5" />;
    };

    if (!data || !data.rows || data.rows.length === 0) {
        return (
            <Card className="bg-textured border-gray-200 dark:border-gray-700">
                <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                        No data available for the selected period
                    </p>
                </CardContent>
            </Card>
        );
    }

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(Math.round(num));
    };

    const formatPercent = (num: number) => {
        return (num * 100).toFixed(2) + '%';
    };

    const formatPosition = (num: number) => {
        return num.toFixed(1);
    };

    const getDimensionLabel = (keys: string[] | undefined) => {
        if (!keys || keys.length === 0) return 'N/A';
        return keys[0];
    };

    const isUrl = (text: string) => {
        return text.startsWith('http://') || text.startsWith('https://');
    };

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedText(text);
        setTimeout(() => setCopiedText(null), 2000);
    };

    const handleOpenUrl = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleFilter = (value: string, dimension: Dimension) => {
        // Build GSC filter URL - opens in new tab
        const baseUrl = 'https://search.google.com/search-console/performance/search-analytics';
        // Note: Full filter implementation would need the property URL and proper encoding
        // For now, just copy the value for the user to manually filter
        handleCopy(value);
        alert(`Value copied! You can manually filter by "${value}" in Google Search Console.`);
    };

    return (
        <Card className="bg-textured border-gray-200 dark:border-gray-700">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </CardTitle>
                    <Badge variant="outline">
                        {data.rows.length} {data.rows.length === 1 ? 'result' : 'results'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left py-3 px-4">
                                    <button
                                        onClick={() => handleSort('name')}
                                        className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                                    >
                                        {dimension.charAt(0).toUpperCase() + dimension.slice(1)}
                                        <SortIcon field="name" />
                                    </button>
                                </th>
                                <th className="text-right py-3 px-4">
                                    <button
                                        onClick={() => handleSort('clicks')}
                                        className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                                    >
                                        Clicks
                                        <SortIcon field="clicks" />
                                    </button>
                                </th>
                                <th className="text-right py-3 px-4">
                                    <button
                                        onClick={() => handleSort('impressions')}
                                        className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                                    >
                                        Impressions
                                        <SortIcon field="impressions" />
                                    </button>
                                </th>
                                <th className="text-right py-3 px-4">
                                    <button
                                        onClick={() => handleSort('ctr')}
                                        className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                                    >
                                        CTR
                                        <SortIcon field="ctr" />
                                    </button>
                                </th>
                                <th className="text-right py-3 px-4">
                                    <button
                                        onClick={() => handleSort('position')}
                                        className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 ml-auto"
                                    >
                                        Position
                                        <SortIcon field="position" />
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map((row, index) => {
                                const label = getDimensionLabel(row.keys);
                                const isLinkable = dimension === 'page' && isUrl(label);
                                const showActions = hoveredRow === index;
                                const isLongText = label.length > 60;
                                
                                return (
                                    <tr
                                        key={index}
                                        onMouseEnter={() => setHoveredRow(index)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                                    >
                                        <td className="py-3 px-4 text-gray-900 dark:text-gray-100">
                                            <div className="flex items-center gap-2">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className={`text-sm ${isLongText ? 'line-clamp-2' : ''}`}>
                                                                {label}
                                                            </span>
                                                        </TooltipTrigger>
                                                        {isLongText && (
                                                            <TooltipContent 
                                                                side="bottom" 
                                                                align="start"
                                                                className="max-w-2xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs p-2 break-all"
                                                            >
                                                                {label}
                                                            </TooltipContent>
                                                        )}
                                                    </Tooltip>
                                                </TooltipProvider>
                                                
                                                {/* Action Icons - Show on Hover */}
                                                {showActions && (
                                                    <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                                                        {/* Copy */}
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button
                                                                        onClick={() => handleCopy(label)}
                                                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                                                                    >
                                                                        <Copy className={`w-3.5 h-3.5 ${copiedText === label ? 'text-green-600 dark:text-green-400' : ''}`} />
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top" className="text-xs">
                                                                    {copiedText === label ? 'Copied!' : 'Copy'}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>

                                                        {/* Open URL */}
                                                        {isLinkable && (
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <button
                                                                            onClick={() => handleOpenUrl(label)}
                                                                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                                                                        >
                                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top" className="text-xs">
                                                                        Open page
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        )}

                                                        {/* Filter */}
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button
                                                                        onClick={() => handleFilter(label, dimension)}
                                                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400"
                                                                    >
                                                                        <Filter className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top" className="text-xs">
                                                                    Filter by this value
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                                            {formatNumber(row.clicks)}
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                            {formatNumber(row.impressions)}
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                            {formatPercent(row.ctr)}
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                            {formatPosition(row.position)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

