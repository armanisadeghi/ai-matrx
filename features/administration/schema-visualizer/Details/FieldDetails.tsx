// features/administration/schema-visualizer/Details/FieldDetails.tsx
// Standalone field-detail panel — operates on a SchemaTable/SchemaColumn pair.

import { useState } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
    AlertCircle,
    Component,
    Database,
    KeyRound,
    Settings2,
} from "lucide-react";
import { ComponentIcon } from "../ComponentIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { SchemaTable } from "../types-standalone";

interface FieldDetailsProps {
    table: SchemaTable;
    fieldName: string;
}

export function FieldDetails({ table, fieldName }: FieldDetailsProps) {
    const column = table.columns[fieldName];
    const [showAdvanced, setShowAdvanced] = useState(false);

    if (!column) {
        return (
            <ScrollArea className="h-[calc(100dvh-8rem)]">
                <div className="space-y-6 p-6">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Field not found</AlertTitle>
                        <AlertDescription>
                            Could not find column <code>{fieldName}</code> on table{" "}
                            <code>{table.table_name}</code>.
                        </AlertDescription>
                    </Alert>
                </div>
            </ScrollArea>
        );
    }

    const primaryKeyCols = Array.isArray(table.primaryKey)
        ? table.primaryKey
        : table.primaryKey
          ? [table.primaryKey]
          : [];
    const isPrimaryKey = primaryKeyCols.includes(column.column_name);

    return (
        <ScrollArea className="h-[calc(100dvh-8rem)]">
            <div className="space-y-6 p-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">{column.column_name}</h2>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                            <Settings2 className="mr-2 h-4 w-4" />
                            Advanced
                        </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {isPrimaryKey && (
                            <Badge variant="default" className="flex items-center">
                                <KeyRound className="mr-1 h-3 w-3" />
                                Primary Key
                            </Badge>
                        )}
                        <Badge variant="outline" className="flex items-center">
                            <Database className="mr-1 h-3 w-3" />
                            {column.data_type}
                        </Badge>
                        {!column.is_nullable && (
                            <Badge variant="secondary">Required</Badge>
                        )}
                    </div>
                </div>

                <Tabs defaultValue="details">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="details">Details</TabsTrigger>
                        <TabsTrigger value="component">Type</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details">
                        <Card>
                            <CardContent className="space-y-4 pt-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Column Name</p>
                                        <p className="text-sm text-muted-foreground">
                                            {column.column_name}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Data Type</p>
                                        <p className="text-sm text-muted-foreground">
                                            {column.data_type}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Nullable</p>
                                        <p className="text-sm text-muted-foreground">
                                            {column.is_nullable ? "Yes" : "No"}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Default</p>
                                        <p className="text-sm text-muted-foreground">
                                            {column.column_default ?? "—"}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Position</p>
                                        <p className="text-sm text-muted-foreground">
                                            {column.ordinal_position}
                                        </p>
                                    </div>
                                </div>

                                {showAdvanced && (
                                    <div className="pt-4 border-t">
                                        <h4 className="text-sm font-medium mb-2">
                                            Raw Column
                                        </h4>
                                        <pre className="bg-muted p-4 rounded-lg text-xs">
                                            {JSON.stringify(column, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="component">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Component className="h-5 w-5" />
                                    Type Indicator
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <ComponentIcon
                                        dataType={column.data_type}
                                        className="h-8 w-8 text-primary"
                                        size={32}
                                    />
                                    <div>
                                        <p className="font-medium">{column.data_type}</p>
                                        <p className="text-sm text-muted-foreground">
                                            Postgres data type
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </ScrollArea>
    );
}
