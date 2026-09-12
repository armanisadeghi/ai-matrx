// components/debug/debug-stats.tsx

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@ai-matrx/kit/format";

// Add type for Chrome's non-standard memory API
interface MemoryInfo {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
}

interface ExtendedPerformance extends Performance {
    memory?: MemoryInfo;
}

export function DebugStats() {
    const [memoryInfo, setMemoryInfo] = useState({
        used: 0,
        total: 0,
        limit: 0
    });
    const [performanceMetrics, setPerformanceMetrics] = useState({
        resourceCount: 0,
        loadTime: 0,
        firstContentfulPaint: 0,
        domInteractive: 0
    });

    useEffect(() => {
        const updateMetrics = () => {
            const extendedPerf = performance as ExtendedPerformance;

            // Update memory metrics if available
            if (extendedPerf.memory) {
                // Raw bytes in state: the unit is formatFileSize's decision,
                // and the gauge ratio below is unit-free either way.
                setMemoryInfo({
                    used: extendedPerf.memory.usedJSHeapSize,
                    total: extendedPerf.memory.totalJSHeapSize,
                    limit: extendedPerf.memory.jsHeapSizeLimit
                });
            }

            // Performance metrics
            const resources = performance.getEntriesByType('resource');
            const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
            const paintEntry = performance.getEntriesByType('paint').find(
                entry => entry.name === 'first-contentful-paint'
            );

            setPerformanceMetrics({
                resourceCount: resources.length,
                loadTime: navEntry ? Math.round(navEntry.loadEventEnd - navEntry.startTime) : 0,
                firstContentfulPaint: paintEntry ? Math.round(paintEntry.startTime) : 0,
                domInteractive: navEntry ? Math.round(navEntry.domInteractive) : 0
            });
        };

        updateMetrics();
        const interval = setInterval(updateMetrics, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Real-Time Metrics</CardTitle>
                <CardDescription>System performance and resource usage</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="memory">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="memory">Memory</TabsTrigger>
                        <TabsTrigger value="performance">Performance</TabsTrigger>
                    </TabsList>

                    <TabsContent value="memory" className="space-y-4">
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span>Heap Usage</span>
                                    <span>{formatFileSize(memoryInfo.used)} / {formatFileSize(memoryInfo.limit)}</span>
                                </div>
                                <Progress
                                    value={(memoryInfo.used / memoryInfo.limit) * 100}
                                    className="h-2"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">Total Allocated</p>
                                    <p className="text-2xl font-bold">{formatFileSize(memoryInfo.total)}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">Heap Limit</p>
                                    <p className="text-2xl font-bold">{formatFileSize(memoryInfo.limit)}</p>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="performance" className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Load Time</p>
                                <p className="text-2xl font-bold">{performanceMetrics.loadTime}ms</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Resources</p>
                                <p className="text-2xl font-bold">{performanceMetrics.resourceCount}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">First Paint</p>
                                <p className="text-2xl font-bold">{performanceMetrics.firstContentfulPaint}ms</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">DOM Interactive</p>
                                <p className="text-2xl font-bold">{performanceMetrics.domInteractive}ms</p>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
