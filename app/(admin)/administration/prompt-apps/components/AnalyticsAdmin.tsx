'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import {
    BarChart3,
    Users,
    Activity,
    DollarSign,
    Clock,
    CheckCircle,
    XCircle,
    TrendingUp
} from 'lucide-react';
import MatrxMiniLoader from '@/components/loaders/MatrxMiniLoader';
import { fetchAnalytics } from '@/lib/services/prompt-apps-admin-service';

export function AnalyticsAdmin() {
    const [analytics, setAnalytics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchAnalytics({ limit: 100 });
            setAnalytics(data);
        } catch (error) {
            console.error('Error loading analytics:', error);
            toast({
                title: "Error",
                description: "Failed to load analytics",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const totals = analytics.reduce((acc, app) => ({
        totalExecutions: acc.totalExecutions + (app.total_executions || 0),
        totalUniqueUsers: acc.totalUniqueUsers + (app.unique_anonymous_users || 0) + (app.unique_authenticated_users || 0),
        totalCost: acc.totalCost + parseFloat(app.total_cost || 0),
        totalTokens: acc.totalTokens + (app.total_tokens || 0),
        successfulExecutions: acc.successfulExecutions + (app.successful_executions || 0),
        failedExecutions: acc.failedExecutions + (app.failed_executions || 0)
    }), {
        totalExecutions: 0,
        totalUniqueUsers: 0,
        totalCost: 0,
        totalTokens: 0,
        successfulExecutions: 0,
        failedExecutions: 0
    });

    const overallSuccessRate = totals.totalExecutions > 0 
        ? (totals.successfulExecutions / totals.totalExecutions * 100).toFixed(2)
        : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full w-full">
                <MatrxMiniLoader />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-textured overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border bg-textured">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Analytics Dashboard
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Performance metrics across all prompt apps
                </p>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {/* Overview Cards */}
                    <div className="grid grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-blue-600" />
                                    Total Executions
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {totals.totalExecutions.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Across {analytics.length} apps
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Users className="w-4 h-4 text-purple-600" />
                                    Unique Users
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {totals.totalUniqueUsers.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Anonymous + Authenticated
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    Success Rate
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {overallSuccessRate}%
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {totals.successfulExecutions.toLocaleString()} / {totals.totalExecutions.toLocaleString()}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-green-600" />
                                    Total Cost
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    ${totals.totalCost.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {totals.totalTokens.toLocaleString()} tokens
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Apps List with Analytics */}
                    <Card>
                        <CardHeader>
                            <CardTitle>App Performance</CardTitle>
                            <CardDescription>Detailed metrics for each app</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {analytics.map(app => (
                                    <div
                                        key={app.app_id}
                                        className="border-border rounded-lg p-4 hover:shadow-sm transition-shadow"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                                        {app.name}
                                                    </h4>
                                                    <Badge variant="outline">{app.status}</Badge>
                                                    <code className="text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                                                        {app.slug}
                                                    </code>
                                                </div>

                                                <div className="grid grid-cols-5 gap-4 text-sm">
                                                    <div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                            Total Executions
                                                        </div>
                                                        <div className="font-medium flex items-center gap-1">
                                                            <Activity className="w-3 h-3" />
                                                            {(app.total_executions || 0).toLocaleString()}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                            24h / 7d / 30d
                                                        </div>
                                                        <div className="font-medium">
                                                            {app.executions_24h} / {app.executions_7d} / {app.executions_30d}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                            Success Rate
                                                        </div>
                                                        <div className="font-medium flex items-center gap-1">
                                                            {parseFloat(app.success_rate_percent || 0) >= 95 ? (
                                                                <CheckCircle className="w-3 h-3 text-green-600" />
                                                            ) : (
                                                                <XCircle className="w-3 h-3 text-red-600" />
                                                            )}
                                                            {app.success_rate_percent}%
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                            Avg Time
                                                        </div>
                                                        <div className="font-medium flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {app.avg_execution_time_ms || 0}ms
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                            Cost
                                                        </div>
                                                        <div className="font-medium flex items-center gap-1">
                                                            <DollarSign className="w-3 h-3" />
                                                            ${parseFloat(app.total_cost || 0).toFixed(4)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-4 text-xs text-gray-600 dark:text-gray-400 mt-3 pt-3 border-t border-border">
                                                    <div>
                                                        <span className="font-medium">Users:</span> {app.unique_anonymous_users || 0} anonymous, {app.unique_authenticated_users || 0} auth
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Results:</span> {app.successful_executions || 0} success, {app.failed_executions || 0} failed
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Performance:</span> p50: {app.median_execution_time_ms || 0}ms, p95: {app.p95_execution_time_ms || 0}ms
                                                    </div>
                                                </div>

                                                {app.first_execution_at && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                        First: {new Date(app.first_execution_at).toLocaleDateString()} • 
                                                        Last: {app.last_execution_at ? new Date(app.last_execution_at).toLocaleDateString() : 'N/A'}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {app.executions_24h > 10 && (
                                                    <Badge variant="outline" className="text-green-600 border-green-600">
                                                        <TrendingUp className="w-3 h-3 mr-1" />
                                                        Active
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {analytics.length === 0 && (
                                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                        <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No analytics data available</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </ScrollArea>
        </div>
    );
}

