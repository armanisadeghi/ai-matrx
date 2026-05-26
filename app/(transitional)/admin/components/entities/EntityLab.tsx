// app/(authenticated)/admin/components/entities/EntityLab.tsx
"use client";

import { useState, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/matrx/use-toast";
import EntityHeader from "./EntityHeader";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";

const EntityLab = () => {
  const [entity, setEntity] = useState(null); // Set by EntityHeader
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const { toast } = useToast();

  // Handle record selection
  const handleRecordSelect = (recordId: string) => {
    setSelectedRecords((prev) =>
      prev.includes(recordId)
        ? prev.filter((id) => id !== recordId)
        : [...prev, recordId],
    );
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full h-full"
    >
      <Card>
        {/* Use EntityHeader to handle entity selection and data */}
        <CardHeader>
          <EntityHeader
            onEntityChange={(entity) => {
              setEntity(entity);
            }}
          />
        </CardHeader>
        <CardContent>
          <Tabs>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="browse">Browse</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="filters">Filters & Sort</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>

            <TabsContent value="browse">
              {/* Render content based on entity being loaded */}
              {entity ? (
                <Suspense fallback={<TableLoadingComponent />}>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="space-x-2">
                        <Button
                          onClick={() => entity.refreshData()}
                          disabled={entity.loadingState.loading}
                        >
                          {entity.loadingState.loading && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Refresh
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => entity.clearSelection()}
                        >
                          Clear Selection
                        </Button>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">
                          Page {entity.paginationInfo.page} of{" "}
                          {entity.paginationInfo.totalPages}
                        </span>
                        <Button
                          variant="outline"
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
                        <Button
                          variant="outline"
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
                    </div>

                    <ScrollArea className="h-[750px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">Select</TableHead>
                            {entity.entityMetadata?.fields.map((field) => (
                              <TableHead key={field.name}>
                                {field.displayName}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <AnimatePresence>
                            {entity.currentPage.map((record: any) => (
                              <motion.tr
                                key={
                                  record[entity.primaryKeyMetadata.fields[0]]
                                }
                                variants={itemVariants}
                                initial="hidden"
                                animate="visible"
                                exit="hidden"
                                className="cursor-pointer hover:bg-muted"
                                onClick={() =>
                                  handleRecordSelect(
                                    record[entity.primaryKeyMetadata.fields[0]],
                                  )
                                }
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedRecords.includes(
                                      record[
                                        entity.primaryKeyMetadata.fields[0]
                                      ],
                                    )}
                                    onCheckedChange={() => {}}
                                    aria-label="Row selected"
                                  />
                                </TableCell>
                                {entity.entityMetadata?.fields.map((field) => (
                                  <TableCell key={field.name}>
                                    {record[field.name]}
                                  </TableCell>
                                ))}
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </Suspense>
              ) : (
                <div className="text-center text-muted-foreground">
                  Please select an entity to load data.
                </div>
              )}
            </TabsContent>

            {/* Other tab content like operations, filters, metrics, logs, debug... */}
          </Tabs>
        </CardContent>

        <CardFooter className="bg-muted/50 p-4">
          <div className="w-full flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Badge
                variant={entity?.loadingState.loading ? "secondary" : "default"}
              >
                {entity?.loadingState.loading ? "Loading..." : "Ready"}
              </Badge>
              {entity?.error && (
                <Badge variant="destructive">
                  Error: {entity.error.message}
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              Total Records: {entity?.paginationInfo.totalCount}
            </span>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

export default EntityLab;
