// app/(authenticated)/admin/debug/page.tsx

'use client';

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Bug } from 'lucide-react';
import DebugInterface from '@/components/debug/debug-interface';
import { useEffect, useState } from 'react';

// Add type for Chrome's non-standard memory API
interface MemoryInfo {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
}

interface ExtendedPerformance extends Performance {
    memory?: MemoryInfo;
}

export default function DebugPage() {
    const [memoryInfo, setMemoryInfo] = useState({
        used: 0,
        limit: 0
    });
    const [resourceCount, setResourceCount] = useState(0);
    const [loadTime, setLoadTime] = useState(0);

    useEffect(() => {
        // Safely check for memory API support
        const extendedPerf = performance as ExtendedPerformance;
        if (extendedPerf.memory) {
            setMemoryInfo({
                used: Math.round(extendedPerf.memory.usedJSHeapSize / 1024 / 1024),
                limit: Math.round(extendedPerf.memory.jsHeapSizeLimit / 1024 / 1024)
            });
        }

        // Get resource count
        setResourceCount(performance.getEntriesByType('resource').length);

        // Get page load time
        const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navEntry) {
            setLoadTime(Math.round(navEntry.loadEventEnd - navEntry.startTime));
        }

        // Update metrics periodically
        const interval = setInterval(() => {
            if (extendedPerf.memory) {
                setMemoryInfo({
                    used: Math.round(extendedPerf.memory.usedJSHeapSize / 1024 / 1024),
                    limit: Math.round(extendedPerf.memory.jsHeapSizeLimit / 1024 / 1024)
                });
            }
            setResourceCount(performance.getEntriesByType('resource').length);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Debug Console</h1>
                    <p className="text-muted-foreground mt-2">
                        Monitor application logs and schema resolution in real-time
                    </p>
                </div>
                <Button variant="outline" className="gap-2">
                    <Bug className="w-4 h-4" />
                    Report an Issue
                </Button>
            </div>

            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Debug Mode Active</AlertTitle>
                <AlertDescription>
                    This interface provides real-time monitoring of application events and schema resolutions.
                    Use the filters and search to narrow down specific logs.
                </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>System Overview</CardTitle>
                        <CardDescription>Current system status and statistics</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="memory" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="memory">Memory Usage</TabsTrigger>
                                <TabsTrigger value="performance">Performance</TabsTrigger>
                            </TabsList>
                            <TabsContent value="memory" className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Heap Used</p>
                                        <p className="text-2xl font-bold">
                                            {memoryInfo.used > 0 ? `${memoryInfo.used}MB` : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Heap Limit</p>
                                        <p className="text-2xl font-bold">
                                            {memoryInfo.limit > 0 ? `${memoryInfo.limit}MB` : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </TabsContent>
                            <TabsContent value="performance" className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Page Load Time</p>
                                        <p className="text-2xl font-bold">
                                            {loadTime}ms
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Resources</p>
                                        <p className="text-2xl font-bold">
                                            {resourceCount}
                                        </p>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>Common debugging tasks and actions</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <Button variant="outline" className="w-full">
                            Clear Cache
                        </Button>
                        <Button variant="outline" className="w-full">
                            Reset Storage
                        </Button>
                        <Button variant="outline" className="w-full">
                            Test Connection
                        </Button>
                        <Button variant="outline" className="w-full">
                            Download Logs
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <DebugInterface />
        </div>
    );
}
