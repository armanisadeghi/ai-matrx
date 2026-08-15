'use client';

import React, { useState } from 'react';
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_UTILITIES_SURFACE_NAME, createAdminUtilitiesScope } from "@/features/surfaces/manifests/admin-utilities.manifest";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type CacheItem = {
    id: string;
    title: string;
    description: string;
    endpoint: string;
    icon: React.ReactNode;
};

const cacheItems: CacheItem[] = [
    {
        id: 'ai-models',
        title: 'AI Models Cache',
        description: 'Cached list of all non-deprecated AI models (12 hour cache)',
        endpoint: '/api/ai-models/revalidate',
        icon: <Database className="h-5 w-5" />,
    },
    // Add more cache items here as needed
];

type RefreshState = {
    [key: string]: {
        loading: boolean;
        success?: boolean;
        message?: string;
        timestamp?: string;
    };
};

export default function ServerCacheManager() {
    const [refreshStates, setRefreshStates] = useState<RefreshState>({});

    const handleRefresh = async (item: CacheItem) => {
        setRefreshStates(prev => ({
            ...prev,
            [item.id]: { loading: true }
        }));

        try {
            const response = await fetch(item.endpoint, {
                method: 'POST',
            });

            const data = await response.json();

            if (response.ok) {
                setRefreshStates(prev => ({
                    ...prev,
                    [item.id]: {
                        loading: false,
                        success: true,
                        message: data.message || 'Cache refreshed successfully',
                        timestamp: data.timestamp || new Date().toISOString(),
                    }
                }));

                // Clear success message after 5 seconds
                setTimeout(() => {
                    setRefreshStates(prev => ({
                        ...prev,
                        [item.id]: { loading: false }
                    }));
                }, 5000);
            } else {
                throw new Error(data.error || 'Failed to refresh cache');
            }
        } catch (error) {
            setRefreshStates(prev => ({
                ...prev,
                [item.id]: {
                    loading: false,
                    success: false,
                    message: error instanceof Error ? error.message : 'An error occurred',
                }
            }));

            // Clear error message after 5 seconds
            setTimeout(() => {
                setRefreshStates(prev => ({
                    ...prev,
                    [item.id]: { loading: false }
                }));
            }, 5000);
        }
    };

    const handleRefreshAll = async () => {
        for (const item of cacheItems) {
            await handleRefresh(item);
            // Small delay between requests to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    };

    return (
        <SurfaceRuntimeProvider
            surfaceName={ADMIN_UTILITIES_SURFACE_NAME}
            getScope={() => createAdminUtilitiesScope({
                utilities_section: "server_cache",
                server_cache_items: cacheItems.map((item) => ({ ...item, state: refreshStates[item.id] ?? null, icon: undefined })),
            })}
        >
        <div className="w-full h-full bg-gray-50 dark:bg-neutral-900 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                            Server Cache Management
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            Manage and refresh server-side caches
                        </p>
                    </div>
                    {cacheItems.length > 1 && (
                        <Button
                            onClick={handleRefreshAll}
                            disabled={Object.values(refreshStates).some(state => state.loading)}
                            className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh All
                        </Button>
                    )}
                </div>

                {/* Cache Items Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {cacheItems.map((item) => {
                        const state = refreshStates[item.id];
                        
                        return (
                            <Card 
                                key={item.id}
                                className="p-6 bg-textured border-gray-200 dark:border-gray-700"
                            >
                                <div className="space-y-4">
                                    {/* Header */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                                {item.icon}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                                                    {item.title}
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Alert */}
                                    {state && !state.loading && state.message && (
                                        <Alert 
                                            variant={state.success ? "default" : "destructive"}
                                            className={state.success 
                                                ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20" 
                                                : ""
                                            }
                                        >
                                            {state.success ? (
                                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                            ) : (
                                                <AlertCircle className="h-4 w-4" />
                                            )}
                                            <AlertTitle className={state.success 
                                                ? "text-green-800 dark:text-green-300" 
                                                : ""
                                            }>
                                                {state.success ? 'Success' : 'Error'}
                                            </AlertTitle>
                                            <AlertDescription className={state.success 
                                                ? "text-green-700 dark:text-green-400" 
                                                : ""
                                            }>
                                                {state.message}
                                                {state.timestamp && (
                                                    <span className="block text-xs mt-1 opacity-75">
                                                        {new Date(state.timestamp).toLocaleString()}
                                                    </span>
                                                )}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {/* Action Button */}
                                    <Button
                                        onClick={() => handleRefresh(item)}
                                        disabled={state?.loading}
                                        className="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                                    >
                                        {state?.loading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Refreshing...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="h-4 w-4 mr-2" />
                                                Refresh Cache
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>

                {/* Info Card */}
                <Card className="p-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="flex-1">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                About Cache Refresh
                            </h4>
                            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                                <li>• Caches are automatically refreshed based on their configured duration</li>
                                <li>• Manual refresh is useful when data is updated and you need immediate changes</li>
                                <li>• Refreshing cache doesn't affect currently loaded pages until they're reloaded</li>
                                <li>• Cache tags allow targeted invalidation without affecting other cached data</li>
                            </ul>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
        </SurfaceRuntimeProvider>
    );
}
