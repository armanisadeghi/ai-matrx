'use client';

import React, { useState, useEffect } from 'react';
import { DbFunctionNode, TabComponentProps } from '@/features/workflows/types';
import { validateNodeUpdate } from '@/features/workflows/utils/node-utils';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";
import { EnrichedBroker } from '@/features/workflows/utils/data-flow-manager';

// Import default tab components
import OverviewTab from './OverviewTab';
import ArgumentsTab from './ArgumentsTab';
import MappingsTab from './MappingsTab';
import Dependencies from './Dependencies';
import BrokersTab from './BrokersTab';
import DescriptionTab from './DescriptionTab';
import ResultsTab from './ResultsTab';
import NodeObjectTab from './NodeObjectTab';

// Define the structure for tab configuration
export interface TabConfig {
  id: string;
  label: string;
  component: React.ComponentType<TabComponentProps>;
}

// Define the structure for custom tabs
export interface CustomTabConfig extends TabConfig {
  replaces?: string; // ID of default tab to replace
}

interface NodeEditorProps {
  nodeData: DbFunctionNode | null;
  onSave: (updatedNodeData: DbFunctionNode) => void;
  onClose: () => void;
  open: boolean;
  customTabs?: CustomTabConfig[]; // Custom tabs to add or replace defaults
  additionalTabs?: TabConfig[]; // Additional tabs to append
  readOnly?: boolean;
  enrichedBrokers: EnrichedBroker[];
  defaultTabId?: string;
}

// Default tab configurations
const DEFAULT_TABS: TabConfig[] = [
  { id: 'basic', label: 'Overview', component: OverviewTab },
  { id: 'arguments', label: 'Arguments', component: ArgumentsTab },
  { id: 'dependencies', label: 'Dependencies', component: Dependencies },
  { id: 'brokers', label: 'Brokers', component: BrokersTab },
  { id: 'mappings', label: 'Mappings', component: MappingsTab },
  { id: 'description', label: 'Description', component: DescriptionTab },
  { id: 'results', label: 'Results', component: ResultsTab },
  { id: 'object', label: 'Admin', component: NodeObjectTab },
];

const WorkflowNodeEditor: React.FC<NodeEditorProps> = ({ 
  nodeData, 
  onSave, 
  onClose,
  open,
  customTabs = [],
  additionalTabs = [],
  readOnly = false,
  enrichedBrokers,
  defaultTabId
}) => {
  const [editingNode, setEditingNode] = useState<DbFunctionNode | null>(nodeData);
  const [cancelClicked, setCancelClicked] = useState(false);


  useEffect(() => {
    setEditingNode(nodeData);
    setCancelClicked(false); // Reset cancel flag when dialog opens
  }, [nodeData]);

  if (!editingNode) return null;

  // Build the final tabs configuration
  const buildTabsConfig = (): TabConfig[] => {
    let tabs = [...DEFAULT_TABS];
    
    // Replace default tabs with custom tabs if specified
    customTabs.forEach(customTab => {
      if (customTab.replaces) {
        const replaceIndex = tabs.findIndex(tab => tab.id === customTab.replaces);
        if (replaceIndex !== -1) {
          tabs[replaceIndex] = customTab;
        }
      } else {
        // Add as additional tab if not replacing
        tabs.push(customTab);
      }
    });
    
    // Add additional tabs
    tabs = [...tabs, ...additionalTabs];
    
    return tabs;
  };

  const finalTabs = buildTabsConfig();

  const handleSave = () => {
    if (editingNode) {
      try {
        validateNodeUpdate(editingNode);
        onSave(editingNode);
        onClose();
      } catch (error) {
        console.error('Validation error:', error);
      }
    }
  };

  const handleCancel = () => {
    setCancelClicked(true);
    onClose();
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      // If dialog is closing and user didn't click cancel, auto-save
      if (!cancelClicked && editingNode) {
        try {
          validateNodeUpdate(editingNode);
          onSave(editingNode);
        } catch (error) {
          console.error('Auto-save validation error:', error);
        }
      }
      onClose();
    }
  };

  const handleNodeUpdate = (updatedNodeData: DbFunctionNode) => {
    setEditingNode(updatedNodeData);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-7xl h-[85dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Edit Node: {editingNode.step_name || 'Unnamed Step'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs defaultValue={defaultTabId || finalTabs[0]?.id} className="w-full h-full flex flex-col">
            <TabsList className="grid w-full flex-shrink-0" style={{ gridTemplateColumns: `repeat(${finalTabs.length}, minmax(0, 1fr))` }}>
              {finalTabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {finalTabs.map(tab => {
                const TabComponent = tab.component;
                return (
                  <TabsContent key={tab.id} value={tab.id}>
                    <TabComponent 
                      nodeData={editingNode} 
                      onNodeUpdate={handleNodeUpdate}
                      enrichedBrokers={enrichedBrokers}
                    />
                  </TabsContent>
                );
              })}
            </div>
          </Tabs>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowNodeEditor; 