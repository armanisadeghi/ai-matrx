"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TableIcon,
  Search,
  ExternalLink,
  Loader,
  Calendar,
  Database,
  Columns,
  Rows,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import {
  unwrapGetUserTableComplete,
  unwrapGetUserTables,
} from "@/utils/user-tables-rpc";
import { format } from "date-fns";
import TableReferenceOverlay from "./TableReferenceOverlay";
import { UserDataReference } from "@/components/user-generated-table-data/tableReferences";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface UserTable {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
  updated_at: string;
  is_public: boolean;
}

interface TableField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

interface TableInfo {
  table_name: string;
  description?: string;
}

interface TableSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReferenceSelect?: (reference: UserDataReference) => void;
  title?: string;
  description?: string;
}

export default function TableSelectionModal({
  isOpen,
  onClose,
  onReferenceSelect,
  title = "Select Table for Reference",
  description = "Choose a table to create references for workflows",
}: TableSelectionModalProps) {
  const [tables, setTables] = useState<UserTable[]>([]);
  const [filteredTables, setFilteredTables] = useState<UserTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Reference overlay state
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false);
  const [selectedTable, setSelectedTable] = useState<UserTable | null>(null);
  const [selectedTableFields, setSelectedTableFields] = useState<TableField[]>(
    [],
  );
  const [selectedTableInfo, setSelectedTableInfo] = useState<TableInfo | null>(
    null,
  );

  // Fetch tables when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTables();
    } else {
      // Reset state when modal closes
      setSearchTerm("");
      setSelectedTable(null);
      setShowReferenceOverlay(false);
    }
  }, [isOpen]);

  // Filter tables based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredTables(tables);
    } else {
      setFilteredTables(
        filterAndSortBySearch(tables, searchTerm, [
          { get: (t) => t.table_name, weight: "title" },
          { get: (t) => t.description, weight: "body" },
        ]),
      );
    }
  }, [tables, searchTerm]);

  const fetchTables = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.rpc("get_user_tables");

      if (error) throw error;
      setTables(unwrapGetUserTables(data ?? null) as UserTable[]);
    } catch (err) {
      console.error("Error fetching tables:", err);
      setError("Failed to load your tables");
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = async (table: UserTable) => {
    try {
      setLoading(true);

      // Fetch table details including fields
      const { data, error } = await supabase.rpc("get_user_table_complete", {
        p_table_id: table.id,
      });

      if (error) throw error;
      const u = unwrapGetUserTableComplete(data ?? null);
      setSelectedTable(table);
      setSelectedTableFields(u.fields as TableField[]);
      setSelectedTableInfo({
        table_name: table.table_name,
        description: table.description,
      });
      setShowReferenceOverlay(true);
    } catch (err) {
      console.error("Error loading table details:", err);
      setError("Failed to load table details");
    } finally {
      setLoading(false);
    }
  };

  const openTableInNewTab = (tableId: string) => {
    window.open(`/data/${tableId}`, "_blank");
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch (err) {
      return "Unknown date";
    }
  };

  const handleReferenceCreated = (reference: UserDataReference) => {
    if (onReferenceSelect) {
      onReferenceSelect(reference);
      onClose(); // Close the modal after selection
    }
  };

  return (
    <>
      <Dialog open={isOpen && !showReferenceOverlay} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[70vw] max-h-[90dvh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>{title}</span>
            </DialogTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {description}
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tables..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Tables Grid */}
            <div className="max-h-[60dvh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading tables...</span>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-500 mb-4">{error}</p>
                  <Button onClick={fetchTables} variant="outline">
                    Try Again
                  </Button>
                </div>
              ) : filteredTables.length === 0 ? (
                <div className="text-center py-8">
                  <TableIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">
                    {searchTerm
                      ? "No tables match your search"
                      : "No tables found"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTables.map((table) => (
                    <Card
                      key={table.id}
                      className="hover:shadow-md transition-all cursor-pointer border-2 hover:border-blue-300 dark:hover:border-blue-700"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200 mb-1">
                              {table.table_name}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                              {table.description || "No description"}
                            </p>
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTableInNewTab(table.id);
                              }}
                              title="Open in new tab"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <TableIcon className="h-5 w-5 text-gray-400" />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div className="flex items-center space-x-2 text-sm">
                            <Rows className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400">
                              {table.row_count} rows
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-sm">
                            <Columns className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400">
                              {table.field_count} fields
                            </span>
                          </div>
                        </div>

                        {/* Badges and Date */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {table.is_public && (
                              <Badge variant="secondary" className="text-xs">
                                Public
                              </Badge>
                            )}
                            {!table.is_public && (
                              <Badge variant="outline" className="text-xs">
                                Private
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="h-3 w-3" />
                            {formatDate(table.updated_at)}
                          </div>
                        </div>

                        {/* Select Button */}
                        <Button
                          className="w-full mt-3"
                          onClick={() => handleTableSelect(table)}
                          disabled={loading}
                        >
                          Create Reference
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reference Overlay */}
      {selectedTable && selectedTableInfo && (
        <TableReferenceOverlay
          isOpen={showReferenceOverlay}
          onClose={() => {
            setShowReferenceOverlay(false);
            setSelectedTable(null);
          }}
          tableId={selectedTable.id}
          tableInfo={selectedTableInfo}
          fields={selectedTableFields}
          onReferenceGenerated={
            onReferenceSelect ? handleReferenceCreated : undefined
          }
        />
      )}
    </>
  );
}
