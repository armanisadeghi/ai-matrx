"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LighthouseAuditResultV5 } from "../types";
import { Clock, Gauge, Eye, Activity, Layers, Expand } from "lucide-react";

interface MetricsOverviewProps {
    audits: Record<string, LighthouseAuditResultV5>;
}

const KEY_METRICS = [
    { id: "first-contentful-paint", label: "First Contentful Paint", icon: Eye, unit: "s" },
    { id: "largest-contentful-paint", label: "Largest Contentful Paint", icon: Expand, unit: "s" },
    { id: "total-blocking-time", label: "Total Blocking Time", icon: Clock, unit: "ms" },
    { id: "cumulative-layout-shift", label: "Cumulative Layout Shift", icon: Layers, unit: "" },
    { id: "speed-index", label: "Speed Index", icon: Gauge, unit: "s" },
    { id: "interactive", label: "Time to Interactive", icon: Activity, unit: "s" },
];

export function MetricsOverview({ audits }: MetricsOverviewProps) {
    const getScoreColor = (score: number | null) => {
        if (score === null) return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
        if (score >= 0.9) return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
        if (score >= 0.5) return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300";
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
    };

    const formatValue = (value: number | undefined, unit: string) => {
        if (value === undefined) return "N/A";
        
        // Convert milliseconds to seconds for display if unit is 's'
        if (unit === "s" && value > 100) {
            return (value / 1000).toFixed(2) + " s";
        }
        
        if (unit === "ms") {
            return Math.round(value) + " ms";
        }
        
        if (unit === "") {
            return value.toFixed(3);
        }
        
        return value.toFixed(2) + " " + unit;
    };

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Core Web Vitals & Performance Metrics
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Key metrics that measure loading performance, interactivity, and visual stability
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {KEY_METRICS.map((metric) => {
                    const audit = audits[metric.id];
                    if (!audit) return null;

                    const Icon = metric.icon;
                    const scoreColor = getScoreColor(audit.score);

                    return (
                        <Card
                            key={metric.id}
                            className={`${scoreColor} border-gray-200 dark:border-gray-700`}
                        >
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                                    <Icon className="w-4 h-4" />
                                    {metric.label}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-bold">
                                        {formatValue(audit.numericValue, metric.unit)}
                                    </span>
                                    {audit.score !== null && (
                                        <Badge
                                            variant="outline"
                                            className="font-semibold border-current"
                                        >
                                            {Math.round(audit.score * 100)}
                                        </Badge>
                                    )}
                                </div>
                                {audit.displayValue && (
                                    <p className="text-xs opacity-75">
                                        {audit.displayValue}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

