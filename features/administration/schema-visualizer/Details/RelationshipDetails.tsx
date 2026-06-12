// features/administration/schema-visualizer/Details/RelationshipDetails.tsx
// Standalone relationship-detail panel — operates on the SchemaTable directly.

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    AlertCircle,
    ArrowRightLeft,
    Database,
    GitBranch,
    Link2,
    Table2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { SchemaTable } from "../types-standalone";

interface RelationshipDetailsProps {
    table: SchemaTable;
    relationshipIndex: number;
}

export function RelationshipDetails({
    table,
    relationshipIndex,
}: RelationshipDetailsProps) {
    const relationship = table.relationships[relationshipIndex];

    if (!relationship) {
        return (
            <ScrollArea className="h-[calc(100dvh-8rem)]">
                <div className="space-y-6 p-6">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Relationship not found</AlertTitle>
                        <AlertDescription>
                            No relationship at index {relationshipIndex} on table{" "}
                            <code>{table.table_name}</code>.
                        </AlertDescription>
                    </Alert>
                </div>
            </ScrollArea>
        );
    }

    const getRelationshipColor = (type: string) => {
        switch (type) {
            case "foreignKey":
                return "bg-blue-500";
            case "manyToMany":
                return "bg-green-500";
            case "inverseForeignKey":
                return "bg-purple-500";
            default:
                return "bg-gray-500";
        }
    };

    return (
        <ScrollArea className="h-[calc(100dvh-8rem)]">
            <div className="space-y-6 p-6">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div
                            className={`p-3 rounded-full ${getRelationshipColor(
                                relationship.relationshipType,
                            )}`}
                        >
                            <GitBranch className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">
                                {relationship.relationshipType}
                            </h2>
                            <p className="text-muted-foreground">
                                {table.table_name} → {relationship.relatedTable}
                            </p>
                        </div>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ArrowRightLeft className="h-5 w-5" />
                            Relationship Structure
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between gap-4 p-4 bg-muted rounded-lg">
                            <div className="text-center">
                                <Badge variant="outline" className="mb-2">
                                    Source
                                </Badge>
                                <div className="p-3 border rounded-md bg-background">
                                    <Table2 className="h-5 w-5 mb-1" />
                                    <p className="text-sm font-medium">{table.table_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {relationship.column}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col items-center">
                                <Link2 className="h-5 w-5 mb-1" />
                                <Badge>{relationship.relationshipType}</Badge>
                            </div>

                            <div className="text-center">
                                <Badge variant="outline" className="mb-2">
                                    Target
                                </Badge>
                                <div className="p-3 border rounded-md bg-background">
                                    <Table2 className="h-5 w-5 mb-1" />
                                    <p className="text-sm font-medium">
                                        {relationship.relatedTable}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {relationship.relatedColumn}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {relationship.relationshipType === "manyToMany" &&
                    relationship.junctionTable && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Database className="h-5 w-5" />
                                    Junction Table
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="p-4 border rounded-lg">
                                    <p className="font-medium">{relationship.junctionTable}</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                <Card>
                    <CardHeader>
                        <CardTitle>Technical Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex justify-between p-2 bg-muted rounded">
                                <span className="text-sm font-medium">Source Column</span>
                                <span className="text-sm text-muted-foreground">
                                    {relationship.column}
                                </span>
                            </div>
                            <div className="flex justify-between p-2 bg-muted rounded">
                                <span className="text-sm font-medium">Related Table</span>
                                <span className="text-sm text-muted-foreground">
                                    {relationship.relatedTable}
                                </span>
                            </div>
                            <div className="flex justify-between p-2 bg-muted rounded">
                                <span className="text-sm font-medium">Related Column</span>
                                <span className="text-sm text-muted-foreground">
                                    {relationship.relatedColumn}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ScrollArea>
    );
}
