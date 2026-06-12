'use client';

import React, { useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { CustomNodeEditorProps } from './types';
import { DbFunctionNode } from '@/features/workflows/types';

/**
 * Save button component that handles save logic
 */
const SaveButton: React.FC<{ 
  nodeData: DbFunctionNode; 
  onSave: (nodeData: DbFunctionNode) => void; 
  onClose: () => void;
  validationErrors?: string[];
}> = ({ nodeData, onSave, onClose, validationErrors = [] }) => {
  
  const handleSave = () => {
    try {
      onSave(nodeData);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  return (
    <Button 
      onClick={handleSave} 
      disabled={validationErrors.length > 0}
    >
      Save Changes
    </Button>
  );
};

/**
 * Main CustomNodeEditor component that provides dialog structure
 */
const CustomNodeEditor: React.FC<CustomNodeEditorProps> = ({
  nodeData,
  onSave,
  onClose,
  open,
  component: Component,
  autoSave = false,
  validation = 'permissive',
  title,
  width = 'max-w-7xl',
  height = 'h-[85dvh]',
  nodeDefinition,
  enrichedBrokers,
  defaultTabId
}) => {
  const [cancelClicked, setCancelClicked] = useState(false);
  const [editingNode, setEditingNode] = useState<DbFunctionNode>(nodeData);

  const handleCancel = useCallback(() => {
    setCancelClicked(true);
    onClose();
  }, [onClose]);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setCancelClicked(false);
      onClose();
    }
  }, [onClose, cancelClicked]);

  if (!nodeData) return null;
  if (!nodeDefinition) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className={`${width} ${height} flex flex-col`}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {title || nodeDefinition.name || `Edit Node: ${nodeData.step_name || 'Unnamed Step'}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <Component
            nodeData={editingNode}
            onNodeUpdate={setEditingNode}
            nodeDefinition={nodeDefinition}
            enrichedBrokers={enrichedBrokers}
            defaultTabId={defaultTabId}
          />
        </div>
        
        {!autoSave && (
          <DialogFooter className="flex-shrink-0 ">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <SaveButton 
              nodeData={editingNode}
              onSave={onSave} 
              onClose={onClose}
              validationErrors={[]}
            />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CustomNodeEditor; 