// features/administration/schema-visualizer/SchemaActions.tsx
// Standalone actions panel — reads schema overview via React Query.

"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    FileJson,
    Maximize2,
    Minimize2,
    RefreshCw,
    Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSchemaQuery } from "./hooks/useSchemaQuery";

const SCHEMA_TYPES = ["table", "view", "dynamic", "other"] as const;

export function SchemaActions() {
    const { data: overview } = useSchemaQuery();

    const tables = overview?.tables ?? {};
    const tableValues = Object.values(tables);
    const tableCount = tableValues.length;
    const relationshipCount = tableValues.reduce(
        (acc, table) => acc + table.relationships.length,
        0,
    );

    return (
        <Card className="h-full border-0 rounded-none">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl">Schema Explorer</CardTitle>
                <CardDescription>
                    Visualize and manage your database schema
                </CardDescription>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search tables..." className="pl-8" />
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100dvh-12rem)] pr-4">
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-sm font-medium mb-2">Quick Actions</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" className="justify-start">
                                    <FileJson className="mr-2 h-4 w-4" />
                                    Export Schema
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refresh
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start">
                                    <Maximize2 className="mr-2 h-4 w-4" />
                                    Expand All
                                </Button>
                                <Button variant="outline" size="sm" className="justify-start">
                                    <Minimize2 className="mr-2 h-4 w-4" />
                                    Collapse All
                                </Button>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium mb-2">Statistics</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <Card className="p-3">
                                    <p className="text-sm text-muted-foreground">Tables</p>
                                    <p className="text-2xl font-bold">{tableCount}</p>
                                </Card>
                                <Card className="p-3">
                                    <p className="text-sm text-muted-foreground">Relations</p>
                                    <p className="text-2xl font-bold">{relationshipCount}</p>
                                </Card>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium mb-2">Schema Types</h3>
                            <div className="space-y-2">
                                {SCHEMA_TYPES.map((type) => {
                                    const count = tableValues.filter(
                                        (table) => table.schemaType === type,
                                    ).length;
                                    return (
                                        <div
                                            key={type}
                                            className="flex items-center justify-between p-2 bg-muted rounded-md"
                                        >
                                            <span className="capitalize">{type}</span>
                                            <span className="text-muted-foreground">
                                                {count}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
