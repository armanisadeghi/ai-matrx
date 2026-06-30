import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Key, RefreshCw, Search, Plus, Settings } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import type { DatabasePermission } from "./types";

interface PermissionsListProps {
    permissions?: DatabasePermission[];
    loading?: boolean;
    isRefreshing?: boolean;
    onRefresh?: () => void;
}

const PermissionsList = ({ permissions = [], loading = false, isRefreshing = false, onRefresh = () => {} }: PermissionsListProps) => {
    const [filter, setFilter] = useState("");
    const [selectedType, setSelectedType] = useState("all");

    // Ensure we're getting an array of strings for uniqueTypes
    const uniqueTypes = ["all", ...Array.from(new Set(permissions.map(p => String(p.object_type))))];

    const filteredPermissions = permissions.filter(perm => {
        const matchesFilter = String(perm.object_name).toLowerCase().includes(filter.toLowerCase()) ||
            String(perm.role).toLowerCase().includes(filter.toLowerCase());
        const matchesType = selectedType === "all" || String(perm.object_type) === selectedType;
        return matchesFilter && matchesType;
    });

    const privilegeTypes = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

    const handleFilterChange = (e) => {
        setFilter(e.target.value);
    };

    const handleTypeSelect = (type) => {
        setSelectedType(String(type));
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        Permissions Overview
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRefresh}
                            disabled={loading || isRefreshing}
                        >
                            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button variant="default" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Permission
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filter by object name or role..."
                                value={filter}
                                onChange={handleFilterChange}
                                className="pl-8"
                            />
                        </div>
                        <div className="flex gap-2">
                            {uniqueTypes.map((type, index) => (
                                <Button
                                    key={index}
                                    variant={selectedType === type ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleTypeSelect(type)}
                                >
                                    {String(type)}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center p-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                         <div className="rounded-md border">
                             <Table>
                                 <TableHeader>
                                     <TableRow>
                                         <TableHead>Object Name</TableHead>
                                         <TableHead>Type</TableHead>
                                         <TableHead>Role</TableHead>
                                         {privilegeTypes.map((priv, index) => (
                                             <TableHead key={index} className="text-center">
                                                 {priv.slice(0, 3)}
                                             </TableHead>
                                         ))}
                                         <TableHead className="w-[80px]"></TableHead>
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {filteredPermissions.map((perm, i) => (
                                         <TableRow key={i}>
                                             <TableCell className="font-medium">
                                                 {String(perm.object_name)}
                                             </TableCell>
                                             <TableCell>
                                                 <Badge variant="outline">
                                                     {String(perm.object_type)}
                                                 </Badge>
                                             </TableCell>
                                             <TableCell>{String(perm.role)}</TableCell>
                                             {privilegeTypes.map((priv, j) => (
                                                 <TableCell key={j} className="text-center">
                                                     <Checkbox
                                                         checked={Array.isArray(perm.privileges) && perm.privileges.includes(priv)}
                                                         disabled
                                                     />
                                                 </TableCell>
                                             ))}
                                             <TableCell>
                                                 <Button
                                                     variant="ghost"
                                                     size="sm"
                                                     className="hover:bg-transparent"
                                                 >
                                                     <Settings className="h-4 w-4" />
                                                 </Button>
                                             </TableCell>
                                         </TableRow>
                                     ))}
                                 </TableBody>
                             </Table>
                         </div>
                     )}
                </div>
            </CardContent>
        </Card>
    );
};

export default PermissionsList;
