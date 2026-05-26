"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import type { EntityKeys, EntityData } from "@/types/entityTypes";
import { useEntity } from "@/lib/redux/entity/hooks/useEntity";
import { MatrxRecordId } from "@/lib/redux/entity/types/stateTypes";
import { createRecordKey } from "@/lib/redux/entity/utils/stateHelpUtils";
import { JsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { EditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import { selectFormattedEntityOptions } from "@/lib/redux/schema/globalCacheSelectors";
import { FlexibleQueryOptions } from "@/lib/redux/entity/types/stateTypes";
import { v4 as uuidv4 } from "uuid";
import { useQuickReference } from "@/lib/redux/entity/hooks/useQuickReference";

const EntityTester: React.FC = () => {
  const entitySelectOptions = useAppSelector(selectFormattedEntityOptions);
  const [selectedEntity, setSelectedEntity] = useState<EntityKeys>(
    entitySelectOptions[0].value,
  );
  const [activeTab, setActiveTab] = useState("browse");
  const [operationMode, setOperationMode] = useState<
    "create" | "update" | "delete" | null
  >(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const { toast } = useToast();

  // Use the full entity hook
  const entity = useEntity(selectedEntity);
  const quickReference = useQuickReference(selectedEntity);

  // Memoize records array
  const records = useMemo(
    () => Object.values(entity.allRecords),
    [entity.allRecords],
  );

  // Initial data fetch
  useEffect(() => {
    if (entity.entityMetadata) {
      entity.fetchRecords(1, 10);
    }
  }, [selectedEntity, entity.entityMetadata, entity.fetchRecords]);

  const handleRecordSelect = useCallback(
    (record: EntityData<EntityKeys>) => {
      if (operationMode === "update") {
        setFormData(record);
      }

      // Create an array with just this record for selection
      entity.setSelection([record], "single");
    },
    [operationMode, entity.setSelection],
  );

  const handleCreateRecord = useCallback(async () => {
    try {
      const tempRecordId = uuidv4();
      const createPayload: FlexibleQueryOptions = {
        entityNameAnyFormat: selectedEntity,
        tempRecordId,
        data: formData,
      };
      entity.createRecord([createPayload]);
      toast({
        title: "Success",
        description: "Record created successfully",
      });
      entity.refreshData();
      setFormData({});
      setOperationMode(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create record",
        variant: "destructive",
      });
    }
  }, [entity, formData, toast, selectedEntity]);

  const handleUpdateRecord = useCallback(async () => {
    if (!entity.activeRecord || !entity.activeRecordId) {
      toast({
        title: "Error",
        description: "No record selected for update",
        variant: "destructive",
      });
      return;
    }

    try {
      quickReference.updateRecord(entity.activeRecordId, formData);
      toast({
        title: "Success",
        description: "Record updated successfully",
      });
      entity.refreshData();
      setFormData({});
      setOperationMode(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update record",
        variant: "destructive",
      });
    }
  }, [entity, quickReference, formData, toast]);

  const handleDeleteRecord = useCallback(async () => {
    if (!entity.activeRecord) {
      toast({
        title: "Error",
        description: "No record selected for deletion",
        variant: "destructive",
      });
      return;
    }

    try {
      const primaryKeyValues = entity.primaryKeyMetadata.fields.reduce(
        (acc, field) => {
          acc[field] = entity.activeRecord![field];
          return acc;
        },
        {} as Record<string, MatrxRecordId>,
      );

      entity.deleteRecord(entity.activeRecordId);
      toast({
        title: "Success",
        description: "Record deleted successfully",
      });
      entity.refreshData();
      setOperationMode(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete record",
        variant: "destructive",
      });
    }
  }, [entity, toast, entity.primaryKeyMetadata.fields]);

  const isRecordSelected = useCallback(
    (record: EntityData<typeof selectedEntity>) => {
      const recordKey = createRecordKey(entity.primaryKeyMetadata, record);
      return entity.selectedRecords.includes(recordKey);
    },
    [entity.primaryKeyMetadata, entity.selectedRecords, selectedEntity],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center space-x-4 p-4">
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

        <Button
          variant="outline"
          size="sm"
          onClick={() => entity.refreshData()}
          disabled={entity.loadingState.loading}
        >
          {entity.loadingState.loading && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="sync">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <TabsContent value="browse" className="h-full">
                {entity.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{entity.error.message}</AlertDescription>
                  </Alert>
                )}

                <ScrollArea className="h-[600px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Select</TableHead>
                        {Object.values(entity.entityMetadata.entityFields).map(
                          (field) => (
                            <TableHead key={field.name}>
                              {field.displayName}
                            </TableHead>
                          ),
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow
                          key={createRecordKey(
                            entity.primaryKeyMetadata,
                            record,
                          )}
                          className={`cursor-pointer ${
                            isRecordSelected(record) ? "bg-primary/10" : ""
                          }`}
                          onClick={() => handleRecordSelect(record)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isRecordSelected(record)}
                              onCheckedChange={() => handleRecordSelect(record)}
                              aria-label="Select record"
                              className="shrink-0"
                            />
                          </TableCell>
                          {Object.values(
                            entity.entityMetadata.entityFields,
                          ).map((field) => (
                            <TableCell key={field.name}>
                              {String(record[field.name] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {entity.paginationInfo && (
                  <div className="flex justify-between items-center mt-4">
                    <Button
                      disabled={!entity.paginationInfo.hasPreviousPage}
                      onClick={() =>
                        entity.fetchRecords(
                          entity.paginationInfo.page - 1,
                          entity.paginationInfo.pageSize,
                        )
                      }
                    >
                      Previous
                    </Button>
                    <span>
                      Page {entity.paginationInfo.page} of{" "}
                      {entity.paginationInfo.totalPages}
                    </span>
                    <Button
                      disabled={!entity.paginationInfo.hasNextPage}
                      onClick={() =>
                        entity.fetchRecords(
                          entity.paginationInfo.page + 1,
                          entity.paginationInfo.pageSize,
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="operations" className="h-full p-4 space-y-4">
                <div className="flex space-x-2">
                  <Button
                    variant={operationMode === "create" ? "default" : "outline"}
                    onClick={() => {
                      setOperationMode("create");
                      setFormData({});
                    }}
                  >
                    Create
                  </Button>
                  <Button
                    variant={operationMode === "update" ? "default" : "outline"}
                    onClick={() => {
                      setOperationMode("update");
                      if (entity.activeRecord) {
                        setFormData(entity.activeRecord);
                      }
                    }}
                    disabled={!entity.activeRecord}
                  >
                    Update
                  </Button>
                  <Button
                    variant={
                      operationMode === "delete" ? "destructive" : "outline"
                    }
                    onClick={() => setOperationMode("delete")}
                    disabled={!entity.activeRecord}
                  >
                    Delete
                  </Button>
                </div>

                {operationMode && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {operationMode.charAt(0).toUpperCase() +
                          operationMode.slice(1)}{" "}
                        Record
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <EditableJsonViewer
                        data={formData}
                        onChange={(newData) =>
                          setFormData(newData as Record<string, any>)
                        }
                        validateDelay={500}
                      />
                      <div className="mt-4 flex space-x-2">
                        <Button
                          onClick={() => {
                            if (operationMode === "create")
                              handleCreateRecord();
                            else if (operationMode === "update")
                              handleUpdateRecord();
                            else if (operationMode === "delete")
                              handleDeleteRecord();
                          }}
                        >
                          Confirm {operationMode}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setOperationMode(null);
                            setFormData({});
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="debug" className="h-full p-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Entity Metadata</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <JsonViewer
                      data={{
                        metadata: entity.entityMetadata,
                        primaryKeys: entity.primaryKeyMetadata,
                        displayField: entity.displayField,
                      }}
                      initialExpanded={true}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Current State</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <JsonViewer
                      data={{
                        loadingState: entity.loadingState,
                        error: entity.error,
                        lastError: entity.lastError,
                        currentPage: entity.currentPage,
                        paginationInfo: entity.paginationInfo,
                        selectionMode: entity.selectionMode,
                        selectedCount: entity.selectedRecords.length,
                        activeRecord: entity.activeRecord,
                        filters: entity.currentFilters,
                        isStale: entity.isStale,
                        hasUnsavedChanges: entity.hasUnsavedChanges,
                      }}
                      initialExpanded={true}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
};

export default EntityTester;
