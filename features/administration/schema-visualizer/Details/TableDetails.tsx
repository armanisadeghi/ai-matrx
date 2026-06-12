// features/administration/schema-visualizer/Details/TableDetails.tsx
// Standalone table-detail panel — reads SchemaTable directly.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SchemaTable } from "../types-standalone";

interface TableDetailsProps {
    table: SchemaTable;
}

export function TableDetails({ table }: TableDetailsProps) {
    const primaryKeyCols = Array.isArray(table.primaryKey)
        ? table.primaryKey
        : table.primaryKey
          ? [table.primaryKey]
          : [];

    const sortedColumns = Object.values(table.columns).sort(
        (a, b) => a.ordinal_position - b.ordinal_position,
    );

    return (
        <ScrollArea className="h-[calc(100dvh-8rem)]">
            <div className="space-y-6 p-6">
                <div>
                    <h2 className="text-2xl font-bold mb-2">{table.table_name}</h2>
                    <Badge
                        variant={
                            table.schemaType === "table"
                                ? "default"
                                : table.schemaType === "view"
                                  ? "secondary"
                                  : table.schemaType === "dynamic"
                                    ? "destructive"
                                    : "outline"
                        }
                    >
                        {table.schemaType}
                    </Badge>
                </div>

                <Tabs defaultValue="overview">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="fields">Fields</TabsTrigger>
                        <TabsTrigger value="relationships">Relationships</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Primary Key</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Type</span>
                                        <span>
                                            {primaryKeyCols.length > 1
                                                ? "Composite"
                                                : primaryKeyCols.length === 1
                                                  ? "Single"
                                                  : "None"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Fields</span>
                                        <span>
                                            {primaryKeyCols.length > 0
                                                ? primaryKeyCols.join(", ")
                                                : "—"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Table Info</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Type</span>
                                        <span>{table.table_type}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Columns</span>
                                        <span>{Object.keys(table.columns).length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            Relationships
                                        </span>
                                        <span>{table.relationships.length}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="fields">
                        <Card>
                            <CardContent className="space-y-4">
                                {sortedColumns.map((column) => (
                                    <div
                                        key={column.column_name}
                                        className="flex items-center justify-between p-2 hover:bg-muted rounded-lg"
                                    >
                                        <div>
                                            <p className="font-medium">{column.column_name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {column.data_type}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            {primaryKeyCols.includes(column.column_name) && (
                                                <Badge variant="secondary">Primary Key</Badge>
                                            )}
                                            {!column.is_nullable && (
                                                <Badge variant="outline">Required</Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="relationships">
                        <Card>
                            <CardContent className="space-y-4">
                                {table.relationships.map((rel, index) => (
                                    <div key={index} className="p-4 border rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge
                                                variant={
                                                    rel.relationshipType === "foreignKey"
                                                        ? "default"
                                                        : rel.relationshipType === "manyToMany"
                                                          ? "secondary"
                                                          : "outline"
                                                }
                                            >
                                                {rel.relationshipType}
                                            </Badge>
                                        </div>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Column
                                                </span>
                                                <span>{rel.column}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Related Table
                                                </span>
                                                <span>{rel.relatedTable}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    Related Column
                                                </span>
                                                <span>{rel.relatedColumn}</span>
                                            </div>
                                            {rel.junctionTable && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">
                                                        Junction Table
                                                    </span>
                                                    <span>{rel.junctionTable}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </ScrollArea>
    );
}
