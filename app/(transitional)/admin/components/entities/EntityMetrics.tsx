// components/admin/EntityMetrics.tsx
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    LineChart,
    BarChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {useAppSelector} from "@/lib/redux/hooks";
import {selectFormattedEntityOptions} from "@/lib/redux/schema/globalCacheSelectors";
import {EntityKeys} from "@/types/entityTypes";
import { useEntityMetrics } from '@/lib/redux/entity/hooks/useEntityMetrics';

const EntityMetrics = () => {
    const entitySelectOptions = useAppSelector(selectFormattedEntityOptions);
    const [selectedEntity, setSelectedEntity] = useState<EntityKeys>(entitySelectOptions[0].value);

    const [timeRange, setTimeRange] = useState('24h');
    const [metricType, setMetricType] = useState('performance');
    const entityMetrics = useEntityMetrics(selectedEntity);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Fetch metrics on mount and when entity/timeRange changes
    useEffect(() => {
        fetchMetrics();
    }, [selectedEntity, timeRange]);

    const fetchMetrics = async () => {
        setIsRefreshing(true);
        try {
            await entityMetrics.fetchMetrics();
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    <Select
                        value={selectedEntity}
                        onValueChange={(value) => setSelectedEntity(value as EntityKeys)}
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select Entity" />
                        </SelectTrigger>
                        <SelectContent>
                            {entitySelectOptions.map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Time Range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1h">Last Hour</SelectItem>
                            <SelectItem value="24h">Last 24 Hours</SelectItem>
                            <SelectItem value="7d">Last 7 Days</SelectItem>
                            <SelectItem value="30d">Last 30 Days</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        onClick={fetchMetrics}
                        disabled={isRefreshing}
                    >
                        {isRefreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Refresh Metrics
                    </Button>
                </div>

                <Badge variant="outline">
                    Last Updated: {new Date().toLocaleTimeString()}
                </Badge>
            </div>

            {/* Main Metrics Display */}
            <Tabs value={metricType} onValueChange={setMetricType}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="performance">Performance</TabsTrigger>
                    <TabsTrigger value="operations">Operations</TabsTrigger>
                    <TabsTrigger value="cache">Cache</TabsTrigger>
                    <TabsTrigger value="errors">Errors</TabsTrigger>
                </TabsList>

                <TabsContent value="performance" className="space-y-6">
                    {/* Response Time Metrics */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Response Time Distribution</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={entityMetrics.metrics.performanceMetrics?.responseTimes || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="timestamp" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="avgResponseTime"
                                        stroke="#8884d8"
                                        name="Avg Response Time"
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="p95ResponseTime"
                                        stroke="#82ca9d"
                                        name="95th Percentile"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Throughput Metrics */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Operation Throughput</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={entityMetrics.performanceMetrics?.throughput || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="timestamp" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="reads" fill="#8884d8" name="Reads" />
                                    <Bar dataKey="writes" fill="#82ca9d" name="Writes" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="operations" className="space-y-6">
                    {/* Operation Distribution */}
                    <div className="grid grid-cols-3 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Creates</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold">
                                    {entityMetrics.operationCounts?.creates || 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Updates</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold">
                                    {entityMetrics.operationCounts?.updates || 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Deletes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold">
                                    {entityMetrics.operationCounts?.deletes || 0}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Operation Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Operation Timeline</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={entityMetrics.metrics.operationCounts?.timeline || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="timestamp" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="creates"
                                        stroke="#8884d8"
                                        name="Creates"
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="updates"
                                        stroke="#82ca9d"
                                        name="Updates"
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="deletes"
                                        stroke="#ffc658"
                                        name="Deletes"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="cache" className="space-y-6">
                    {/* Cache Performance */}
                    <div className="grid grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Cache Hit Rate</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={entityMetrics.cacheStats?.hitRate || []}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="timestamp" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="hitRate"
                                            stroke="#8884d8"
                                            name="Hit Rate"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Cache Size</CardTitle>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={entityMetrics.cacheStats?.size || []}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="timestamp" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="size"
                                            stroke="#82ca9d"
                                            name="Cache Size"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Cache Statistics */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Cache Statistics</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-4">
                                <div>
                                    <div className="text-sm text-muted-foreground">Total Hits</div>
                                    <div className="text-2xl font-bold">
                                        {entityMetrics.cacheStats?.totalHits || 0}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Total Misses</div>
                                    <div className="text-2xl font-bold">
                                        {entityMetrics.cacheStats?.totalMisses || 0}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Evictions</div>
                                    <div className="text-2xl font-bold">
                                        {entityMetrics.cacheStats?.evictions || 0}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Memory Usage</div>
                                    <div className="text-2xl font-bold">
                                        {entityMetrics.cacheStats?.memoryUsage || '0 MB'}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="errors" className="space-y-6">
                    {/* Error Rate Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Error Rate Timeline</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={entityMetrics.errorRates?.timeline || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="timestamp" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="errorRate"
                                        stroke="#ff0000"
                                        name="Error Rate"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Error Distribution */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Error Distribution</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={entityMetrics.errorRates?.distribution || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="errorType" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="count" fill="#ff0000" name="Error Count" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Recent Errors */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Errors</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[200px]">
                                {entityMetrics.errorRates?.recent?.map((error, index) => (
                                    <div
                                        key={index}
                                        className="border-b border-border p-4 last:border-0"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-medium">
                                                    {error.message}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {error.timestamp}
                                                </div>
                                            </div>
                                            <Badge variant="destructive">
                                                {error.type}
                                            </Badge>
                                        </div>
                                        {error.details && (
                                            <pre className="mt-2 text-sm bg-muted p-2 rounded">
                                                {JSON.stringify(error.details, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                ))}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default EntityMetrics;
