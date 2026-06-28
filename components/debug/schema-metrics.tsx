'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const EMPTY_METRICS: SchemaMetrics = {
    tableCount: 0,
    totalFields: 0,
    totalVariants: 0,
    tableMetrics: [],
    cacheSize: 0,
    resolutionStats: { successful: 0, failed: 0, total: 0 },
};

interface SchemaMetrics {
    tableCount: number;
    totalFields: number;
    totalVariants: number;
    tableMetrics: Array<{
        name: string;
        fieldCount: number;
        variantCount: number;
        size: number;
    }>;
    cacheSize: number;
    resolutionStats: {
        successful: number;
        failed: number;
        total: number;
    };
}

export function SchemaMetrics() {
    const [metrics] = useState<SchemaMetrics>(EMPTY_METRICS);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Schema Metrics</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="overview">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="tables">Tables</TabsTrigger>
                        <TabsTrigger value="performance">Performance</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Total Tables</p>
                                <p className="text-2xl font-bold">{metrics.tableCount}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Total Fields</p>
                                <p className="text-2xl font-bold">{metrics.totalFields}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Name Variants</p>
                                <p className="text-2xl font-bold">{metrics.totalVariants}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Cache Size</p>
                                <p className="text-2xl font-bold">{metrics.cacheSize}KB</p>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="tables">
                        <ScrollArea className="h-[400px]">
                            <Accordion type="single" collapsible>
                                {metrics.tableMetrics.map((table) => (
                                    <AccordionItem key={table.name} value={table.name}>
                                        <AccordionTrigger>
                                            <div className="flex items-center gap-2">
                                                <span>{table.name}</span>
                                                <Badge variant="outline">{table.fieldCount} fields</Badge>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="space-y-2 p-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-sm font-medium">Field Count</p>
                                                        <p className="text-xl">{table.fieldCount}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">Name Variants</p>
                                                        <p className="text-xl">{table.variantCount}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">Size</p>
                                                        <p className="text-xl">{table.size}KB</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="performance" className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.tableMetrics}>
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="size" fill="#8884d8" name="Size (KB)" />
                                <Bar dataKey="fieldCount" fill="#82ca9d" name="Field Count" />
                            </BarChart>
                        </ResponsiveContainer>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
