// app/admin/components/entity-testing/tabs/BrowseTab.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";

const BrowseTab = ({ entity, handleRecordSelect, selectedRecords }) => {
  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
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
          <Button variant="outline" onClick={() => entity.clearSelection()}>
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
                <TableHead key={field.name}>{field.displayName}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {entity.currentPage.map((record: any) => (
                <motion.tr
                  key={record[entity.primaryKeyMetadata.fields[0]]}
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
                        record[entity.primaryKeyMetadata.fields[0]],
                      )}
                      onCheckedChange={() => {}}
                      aria-label="Row selected"
                    />
                  </TableCell>
                  {entity.entityMetadata?.fields.map((field) => (
                    <TableCell key={field.name}>{record[field.name]}</TableCell>
                  ))}
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default BrowseTab;
