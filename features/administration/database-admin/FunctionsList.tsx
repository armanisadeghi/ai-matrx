import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SquareFunction, Check, RefreshCw } from "lucide-react";
import type { DatabaseFunction } from "./types";

interface FunctionsListProps {
    functions: DatabaseFunction[];
    loading: boolean;
    isRefreshing: boolean;
    onRefresh: () => void;
    onViewDetails: (func: DatabaseFunction) => void;
}

export const FunctionsList = ({ functions, loading, isRefreshing, onRefresh, onViewDetails }: FunctionsListProps) => (
    <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
                <SquareFunction className="h-5 w-5" />
                Database Functions
            </CardTitle>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
        </CardHeader>
        <CardContent className="p-0">
            {" "}
            {/* Remove default padding */}
            <div className="rounded-md border">
                {" "}
                {/* Add border container */}
                <div className="relative w-full overflow-auto">
                    {" "}
                    {/* Add overflow handling */}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Function Name</TableHead>
                                <TableHead>Schema</TableHead>
                                <TableHead>Security</TableHead>
                                <TableHead>Arguments</TableHead>
                                <TableHead>Returns</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center">
                                        <div className="flex justify-center p-4">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                functions.map((func, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{func.name}</TableCell>
                                        <TableCell>{func.schema}</TableCell>
                                        <TableCell>
                                            {func.security_type === "SECURITY DEFINER" ? (
                                                <span className="flex items-center gap-1 text-green-500">
                                                    <Check className="h-4 w-4" /> Definer
                                                </span>
                                            ) : (
                                                <span className="text-yellow-500">Invoker</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{func.arguments}</TableCell>
                                        <TableCell>{func.returns}</TableCell>
                                        <TableCell>
                                            <Button variant="outline" size="sm" onClick={() => onViewDetails(func)}>
                                                View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </CardContent>
    </Card>
);
