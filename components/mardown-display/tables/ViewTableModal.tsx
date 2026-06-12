"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";

interface TableInfo {
  table_id: string;
  table_name: string;
  row_count: string;
  field_count: string;
}

interface ViewTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableInfo: TableInfo;
}

const ViewTableModal: React.FC<ViewTableModalProps> = ({ 
  isOpen, 
  onClose, 
  tableInfo 
}) => {
  const handleOpenInNewTab = () => {
    if (tableInfo?.table_id) {
      window.open(`/data/${tableInfo.table_id}`, '_blank');
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={cn(
        "bg-textured text-gray-900 dark:text-gray-100 overflow-hidden",
        "max-w-[95vw] w-[95vw] h-[90dvh] p-3 border-3 border-gray-200 dark:border-gray-700 rounded-3xl"
      )}>
        <DialogHeader className="flex flex-row items-center justify-between mb-1">
          <DialogTitle className="text-xl font-semibold">
          This table has {tableInfo.row_count} rows and {tableInfo.field_count} fields per row.
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-0">          
          <div className="h-[calc(85dvh-140px)] overflow-auto border-border rounded-lg bg-textured">
            <UserTableViewer tableId={tableInfo.table_id} showTableSelector={false} />
          </div>
        </div>
        
        <DialogFooter className="flex items-center gap-2 mt-2 pt-2">
          <div className="flex justify-end w-full gap-2">
            <Button
              variant="outline"
              onClick={handleOpenInNewTab}
              className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-800/30 border border-blue-300 dark:border-blue-700"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </Button>
            <Button
              variant="default"
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewTableModal; 