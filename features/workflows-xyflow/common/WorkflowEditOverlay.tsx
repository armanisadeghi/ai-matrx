'use client';

import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { workflowActions } from '@/lib/redux/workflow/slice';
import { updateWorkflow } from '@/lib/redux/workflow/thunks';
import { workflowsSelectors } from '@/lib/redux/workflow/selectors';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, X, Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface WorkflowEditOverlayProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WorkflowEditOverlay({ workflowId, isOpen, onClose }: WorkflowEditOverlayProps) {
  const dispatch = useAppDispatch();
  const workflow = useAppSelector((state) => workflowsSelectors.workflowById(state, workflowId));
  const [isSaving, setIsSaving] = useState(false);

  // Local state for JSON fields - only for editing, not validation (sources removed - handled separately)
  const [jsonFields, setJsonFields] = useState({
    inputs: workflow?.inputs ? JSON.stringify(workflow.inputs, null, 2) : '',
    outputs: workflow?.outputs ? JSON.stringify(workflow.outputs, null, 2) : '',
    dependencies: workflow?.dependencies ? JSON.stringify(workflow.dependencies, null, 2) : '',
    destinations: workflow?.destinations ? JSON.stringify(workflow.destinations, null, 2) : '',
    actions: workflow?.actions ? JSON.stringify(workflow.actions, null, 2) : '',
    tags: workflow?.tags ? JSON.stringify(workflow.tags, null, 2) : '',
    metadata: workflow?.metadata ? JSON.stringify(workflow.metadata, null, 2) : '',
  });

  // Local state for sources - each source as individual JSON string
  const [sourceEntries, setSourceEntries] = useState<string[]>(() => {
    if (workflow?.sources && Array.isArray(workflow.sources)) {
      return workflow.sources.map(source => JSON.stringify(source, null, 2));
    }
    return [];
  });

  // Update JSON fields and sources when workflow changes
  React.useEffect(() => {
    if (workflow) {
      setJsonFields({
        inputs: workflow.inputs ? JSON.stringify(workflow.inputs, null, 2) : '',
        outputs: workflow.outputs ? JSON.stringify(workflow.outputs, null, 2) : '',
        dependencies: workflow.dependencies ? JSON.stringify(workflow.dependencies, null, 2) : '',
        destinations: workflow.destinations ? JSON.stringify(workflow.destinations, null, 2) : '',
        actions: workflow.actions ? JSON.stringify(workflow.actions, null, 2) : '',
        tags: workflow.tags ? JSON.stringify(workflow.tags, null, 2) : '',
        metadata: workflow.metadata ? JSON.stringify(workflow.metadata, null, 2) : '',
      });
      if (workflow.sources && Array.isArray(workflow.sources)) {
        setSourceEntries(workflow.sources.map(source => JSON.stringify(source, null, 2)));
      } else {
        setSourceEntries([]);
      }
    }
  }, [workflow]);

  const handleSave = async () => {
    if (!workflow) return;

    setIsSaving(true);
    try {
      // Parse JSON fields and validate
      const parsedJsonFields: Record<string, any> = {};
      const errors: string[] = [];

      Object.entries(jsonFields).forEach(([key, value]) => {
        if (value.trim()) {
          try {
            parsedJsonFields[key] = JSON.parse(value);
          } catch (err) {
            errors.push(`Invalid JSON in ${key}`);
          }
        } else {
          parsedJsonFields[key] = null;
        }
      });

      // Parse sources JSON from individual entries
      let parsedSources = null;
      if (sourceEntries.length > 0) {
        try {
          parsedSources = sourceEntries.map((entry, index) => {
            if (entry.trim()) {
              try {
                return JSON.parse(entry);
              } catch (err) {
                errors.push(`Invalid JSON in source entry ${index + 1}`);
                return null;
              }
            }
            return null;
          }).filter(source => source !== null);
        } catch (err) {
          errors.push('Error processing source entries');
        }
      }

      if (errors.length > 0) {
        toast({
          title: "Validation Error",
          description: errors.join(', '),
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

      // Update workflow
      await dispatch(updateWorkflow({ 
        id: workflowId, 
        updates: {
          ...parsedJsonFields,
          sources: parsedSources,
          // Basic fields are already updated via Redux actions
        }
      })).unwrap();
      
      toast({
        title: "Success",
        description: "Workflow updated successfully."
      });
      
      onClose();
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update workflow. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!workflow) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80dvh] bg-background border-border">
        <DialogHeader>
          <DialogTitle>Edit Workflow</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto max-h-[60dvh] px-1">
            <TabsContent value="basic" className="space-y-4 mt-4">
              {/* Basic Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={workflow.name || ''}
                    onChange={(e) => dispatch(workflowActions.updateField({ 
                      id: workflowId, 
                      field: 'name', 
                      value: e.target.value 
                    }))}
                    placeholder="Enter workflow name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={workflow.description || ''}
                    onChange={(e) => dispatch(workflowActions.updateField({ 
                      id: workflowId, 
                      field: 'description', 
                      value: e.target.value 
                    }))}
                    placeholder="Enter workflow description"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workflow_type">Type</Label>
                    <Input
                      id="workflow_type"
                      value={workflow.workflow_type || ''}
                      onChange={(e) => dispatch(workflowActions.updateField({ 
                        id: workflowId, 
                        field: 'workflow_type', 
                        value: e.target.value 
                      }))}
                      placeholder="Workflow type"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={workflow.category || ''}
                      onChange={(e) => dispatch(workflowActions.updateField({ 
                        id: workflowId, 
                        field: 'category', 
                        value: e.target.value 
                      }))}
                      placeholder="Category"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">Enable or disable this workflow</p>
                  </div>
                  <Switch
                    checked={workflow.is_active || false}
                    onCheckedChange={(checked) => dispatch(workflowActions.updateField({ 
                      id: workflowId, 
                      field: 'is_active', 
                      value: checked 
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Execute</Label>
                    <p className="text-sm text-muted-foreground">Automatically execute this workflow</p>
                  </div>
                  <Switch
                    checked={workflow.auto_execute || false}
                    onCheckedChange={(checked) => dispatch(workflowActions.updateField({ 
                      id: workflowId, 
                      field: 'auto_execute', 
                      value: checked 
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Public</Label>
                    <p className="text-sm text-muted-foreground">Make this workflow publicly accessible</p>
                  </div>
                  <Switch
                    checked={workflow.is_public || false}
                    onCheckedChange={(checked) => dispatch(workflowActions.updateField({ 
                      id: workflowId, 
                      field: 'is_public', 
                      value: checked 
                    }))}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sources" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Workflow Sources</h3>
                  <p className="text-sm text-muted-foreground">Each source entry as individual JSON</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSourceEntries(prev => [...prev, '{\n  \n}'])}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Source
                </Button>
              </div>

              <div className="space-y-4">
                {sourceEntries.map((entry, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`source-${index}`}>Source {index + 1}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSourceEntries(prev => prev.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      id={`source-${index}`}
                      value={entry}
                      onChange={(e) => {
                        const newEntries = [...sourceEntries];
                        newEntries[index] = e.target.value;
                        setSourceEntries(newEntries);
                      }}
                      placeholder="Enter source as JSON object"
                      className="font-mono text-sm"
                      rows={8}
                    />
                  </div>
                ))}

                {sourceEntries.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No sources configured</p>
                    <p className="text-sm">Click "Add Source" to create your first source</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-4">
              {/* JSON Fields */}
              <div className="space-y-4">
                <h3 className="font-medium">Advanced Configuration (JSON)</h3>
                
                {Object.entries(jsonFields).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key} className="capitalize">{key}</Label>
                    <Textarea
                      id={key}
                      value={value}
                      onChange={(e) => setJsonFields(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`Enter ${key} as JSON`}
                      className="font-mono text-sm"
                      rows={20}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WorkflowEditOverlay; 