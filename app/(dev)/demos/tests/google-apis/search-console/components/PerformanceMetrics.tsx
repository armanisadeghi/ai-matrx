"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, MousePointer, Eye, BarChart3 } from "lucide-react";
import type { PerformanceSummary } from "../types";

interface PerformanceMetricsProps {
    summary: PerformanceSummary;
    loading?: boolean;
}

export function PerformanceMetrics({ summary, loading }: PerformanceMetricsProps) {
    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(Math.round(num));
    };

    const formatPercent = (num: number) => {
        return (num * 100).toFixed(2) + '%';
    };

    const formatPosition = (num: number) => {
        return num.toFixed(1);
    };

    const metrics = [
        {
            label: "Total Clicks",
            value: formatNumber(summary.totalClicks),
            icon: MousePointer,
            color: "text-blue-600 dark:text-blue-400",
            bgColor: "bg-blue-50 dark:bg-blue-900/20",
        },
        {
            label: "Total Impressions",
            value: formatNumber(summary.totalImpressions),
            icon: Eye,
            color: "text-purple-600 dark:text-purple-400",
            bgColor: "bg-purple-50 dark:bg-purple-900/20",
        },
        {
            label: "Average CTR",
            value: formatPercent(summary.averageCTR),
            icon: TrendingUp,
            color: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-50 dark:bg-green-900/20",
        },
        {
            label: "Average Position",
            value: formatPosition(summary.averagePosition),
            icon: BarChart3,
            color: "text-orange-600 dark:text-orange-400",
            bgColor: "bg-orange-50 dark:bg-orange-900/20",
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                    <Card
                        key={metric.label}
                        className="bg-textured border-gray-200 dark:border-gray-700"
                    >
                        <CardContent className="p-4">
                            <div className={`w-10 h-10 rounded-lg ${metric.bgColor} flex items-center justify-center mb-3`}>
                                <Icon className={`w-5 h-5 ${metric.color}`} />
                            </div>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                {metric.label}
                            </p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {metric.value}
                            </p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

