'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Edit, Code, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { selectAppletContainers } from '@/lib/redux/app-builder/selectors/appletSelectors';
import { addContainerThunk, removeContainerThunk } from '@/lib/redux/app-builder/thunks/appletBuilderThunks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AppletContainer } from '../../page';
import { saveContainerAndUpdateAppletThunk } from '@/lib/redux/app-builder/thunks/containerBuilderThunks';
import { saveFieldAndUpdateContainerThunk } from '@/lib/redux/app-builder/thunks/fieldBuilderThunks';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import { FieldDefinition } from '@/types/customAppTypes';

interface ContainersEditTabProps {
  appletId: string;
}

export default function ContainersEditTab({ appletId }: ContainersEditTabProps) {
  const dispatch = useAppDispatch();
  const containers = useAppSelector(state => selectAppletContainers(state, appletId)) || [];
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);
  const [containerToDelete, setContainerToDelete] = useState<string | null>(null);
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [jsonEditing, setJsonEditing] = useState<{ id: string, json: string } | null>(null);
  
  // Temp state for container editing
  const [editContainer, setEditContainer] = useState<Partial<AppletContainer> | null>(null);
  
  // New state for field editing
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingFieldContainerId, setEditingFieldContainerId] = useState<string | null>(null);
  const [editField, setEditField] = useState<Partial<FieldDefinition> | null>(null);

  // New state for field JSON editing
  const [fieldJsonEditing, setFieldJsonEditing] = useState<{ containerId: string, fieldId: string, json: string } | null>(null);

  // Handler for adding a new container
  const handleAddContainer = () => {
    // TODO: Implement proper container creation logic
    console.log("Container creation placeholder - implement proper logic later", appletId);
    
    /* Original implementation commented out
    dispatch(addContainerThunk({ 
      appletId,
      container: {
        id: `container-${Date.now()}`,
        label: 'New Container',
        description: '',
        fields: []
      }
    }));
    */
  };

  // Handler for deleting a container
  const handleDeleteContainer = (containerId: string) => {
    dispatch(removeContainerThunk({ 
      appletId, 
      containerId 
    }));
    setContainerToDelete(null);
  };

  // Start editing a container
  const handleEditContainer = (container: AppletContainer) => {
    setEditingContainerId(container.id);
    setEditContainer({...container});
  };

  // Handle changes to container properties
  const handleContainerChange = (key: keyof AppletContainer, value: any) => {
    if (editContainer) {
      setEditContainer({
        ...editContainer,
        [key]: value
      });
    }
  };

  // Save changes to a container
  const handleSaveContainer = () => {
    if (editContainer && editContainer.id) {
      // Preserve fields from the original container
      const originalContainer = containers.find(c => c.id === editContainer.id);
      const updatedContainer = {
        ...originalContainer,
        ...editContainer,
        fields: originalContainer?.fields || []
      } as AppletContainer;

      // TODO: Implement proper container saving logic
      console.log("Container saving placeholder - implement proper logic later", updatedContainer);
      // dispatch(saveContainerAndUpdateAppletThunk({
      //   appletId,
      //   container: updatedContainer
      // }));
      
      setEditingContainerId(null);
      setEditContainer(null);
    }
  };

  // Cancel editing a container
  const handleCancelEdit = () => {
    setEditingContainerId(null);
    setEditContainer(null);
  };

  // Start JSON editing
  const handleStartJsonEdit = (container: AppletContainer) => {
    setJsonEditing({
      id: container.id,
      json: JSON.stringify(container, null, 2)
    });
  };

  // Update JSON during editing
  const handleJsonChange = (json: string) => {
    if (jsonEditing) {
      setJsonEditing({
        ...jsonEditing,
        json
      });
    }
  };

  // Save JSON changes
  const handleSaveJson = () => {
    if (jsonEditing) {
      try {
        const updatedContainer = JSON.parse(jsonEditing.json) as AppletContainer;
        // TODO: Implement proper container saving logic
        console.log("Container saving placeholder - implement proper logic later", updatedContainer);
        // dispatch(saveContainerAndUpdateAppletThunk({
        //   appletId,
        //   container: updatedContainer
        // }));
        setJsonEditing(null);
      } catch (error) {
        console.error("Invalid JSON", error);
        // Would show error message to user in production
      }
    }
  };

  // Remove a field from a container
  const handleRemoveField = (containerId: string, fieldId: string) => {
    const container = containers.find(c => c.id === containerId);
    if (container) {
      const updatedFields = container.fields.filter(f => f.id !== fieldId);
      const updatedContainer = {
        ...container,
        fields: updatedFields
      };
      
      // TODO: Implement proper container saving logic
      console.log("Container saving placeholder - implement proper logic later", updatedContainer);
      // dispatch(saveContainerAndUpdateAppletThunk({
      //   appletId,
      //   container: updatedContainer
      // }));
    }
  };

  // Start editing a field
  const handleEditField = (containerId: string, field: FieldDefinition) => {
    setEditingFieldId(field.id);
    setEditingFieldContainerId(containerId);
    setEditField({...field});
  };

  // Handle changes to field properties
  const handleFieldChange = (key: keyof FieldDefinition, value: any) => {
    if (editField) {
      setEditField({
        ...editField,
        [key]: value
      });
    }
  };

  // Save changes to a field
  const handleSaveField = () => {
    if (editField && editField.id && editingFieldContainerId) {
      const container = containers.find(c => c.id === editingFieldContainerId);
      if (container) {
        const updatedFields = container.fields.map(f => 
          f.id === editField.id ? {...f, ...editField} as FieldDefinition : f
        );
        const updatedContainer = {
          ...container,
          fields: updatedFields
        };
        
        // TODO: Implement proper field saving logic
        console.log("Field saving placeholder - implement proper logic later", updatedContainer);
        // dispatch(saveContainerAndUpdateAppletThunk({
        //   appletId,
        //   container: updatedContainer
        // }));
        
        setEditingFieldId(null);
        setEditingFieldContainerId(null);
        setEditField(null);
      }
    }
  };

  // Cancel editing a field
  const handleCancelFieldEdit = () => {
    setEditingFieldId(null);
    setEditingFieldContainerId(null);
    setEditField(null);
  };

  // Start JSON editing for a field
  const handleStartFieldJsonEdit = (containerId: string, field: FieldDefinition) => {
    setFieldJsonEditing({
      containerId,
      fieldId: field.id,
      json: JSON.stringify(field, null, 2)
    });
  };

  // Update field JSON during editing
  const handleFieldJsonChange = (json: string) => {
    if (fieldJsonEditing) {
      setFieldJsonEditing({
        ...fieldJsonEditing,
        json
      });
    }
  };

  // Save field JSON changes
  const handleSaveFieldJson = () => {
    if (fieldJsonEditing) {
      try {
        const updatedField = JSON.parse(fieldJsonEditing.json) as FieldDefinition;
        const container = containers.find(c => c.id === fieldJsonEditing.containerId);
        
        if (container) {
          const updatedFields = container.fields.map(f => 
            f.id === fieldJsonEditing.fieldId ? updatedField : f
          );
          
          const updatedContainer = {
            ...container,
            fields: updatedFields
          };
          
          // TODO: Implement proper field saving logic
          console.log("Field JSON saving placeholder - implement proper logic later", updatedContainer);
          // dispatch(saveContainerAndUpdateAppletThunk({
          //   appletId,
          //   container: updatedContainer
          // }));
          
          setFieldJsonEditing(null);
        }
      } catch (error) {
        console.error("Invalid JSON", error);
        // Would show error message to user in production
      }
    }
  };

  // Handler for adding a new field to a container
  const handleAddField = (containerId: string) => {
    // TODO: Implement proper field creation logic
    console.log("Field creation placeholder - implement proper logic later", containerId);
    
    /* Original implementation commented out
    const container = containers.find(c => c.id === containerId);
    if (container) {
      const newField: FieldDefinition = {
        id: `field-${Date.now()}`,
        key: `field_${Date.now()}`,
        label: 'New Field',
        component: 'text',
        required: false,
        placeholder: '',
        helpText: '',
      };
      
      const updatedContainer = {
        ...container,
        fields: [...container.fields, newField]
      };
      
      dispatch(saveContainerAndUpdateAppletThunk({
        appletId,
        container: updatedContainer
      }));
    }
    */
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Containers ({containers.length})
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Manage containers and their properties. Fields are managed in the Fields tab.
          </p>
        </div>
        
        <Button onClick={handleAddContainer}>
          <Plus className="h-4 w-4 mr-2" /> Add Container
        </Button>
      </div>

      {containers.length === 0 ? (
        <Card className="p-6 flex flex-col items-center justify-center h-64">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No containers defined for this applet.</p>
          <Button onClick={handleAddContainer}>
            <Plus className="h-4 w-4 mr-2" /> Create First Container
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {containers.map((container) => (
            <Card key={container.id} className="p-4 border-border">
              {editingContainerId === container.id ? (
                // Edit mode for container properties
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Editing Container</h4>
                    <div className="space-x-2">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveContainer}>
                        Save Changes
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="container-label">Label</Label>
                      <Input 
                        id="container-label"
                        value={editContainer?.label || ''}
                        onChange={(e) => handleContainerChange('label', e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="container-shortLabel">Short Label (optional)</Label>
                      <Input 
                        id="container-shortLabel"
                        value={editContainer?.shortLabel || ''}
                        onChange={(e) => handleContainerChange('shortLabel', e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="container-description">Description</Label>
                      <Textarea 
                        id="container-description"
                        value={editContainer?.description || ''}
                        onChange={(e) => handleContainerChange('description', e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="container-helpText">Help Text</Label>
                      <Textarea 
                        id="container-helpText"
                        value={editContainer?.helpText || ''}
                        onChange={(e) => handleContainerChange('helpText', e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="container-gridCols">Grid Columns</Label>
                      <Input 
                        id="container-gridCols"
                        value={editContainer?.gridCols || ''}
                        onChange={(e) => handleContainerChange('gridCols', e.target.value)}
                      />
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="container-hideDescription" 
                        checked={!!editContainer?.hideDescription}
                        onCheckedChange={(checked) => handleContainerChange('hideDescription', !!checked)}
                      />
                      <Label htmlFor="container-hideDescription">Hide Description</Label>
                    </div>
                  </div>
                </div>
              ) : (
                // View mode for container
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{container.label}</h4>
                      <Badge variant="outline">{container.fields.length} fields</Badge>
                    </div>
                    <div className="flex space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditContainer(container)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Code className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-xl">
                          <DialogHeader>
                            <DialogTitle>Edit Container JSON</DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            <textarea
                              value={JSON.stringify(container, null, 2)}
                              onChange={(e) => handleJsonChange(e.target.value)}
                              className="w-full h-96 p-4 font-mono text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none border-border"
                              spellCheck="false"
                            />
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button onClick={handleSaveJson}>Save Changes</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete Container</DialogTitle>
                          </DialogHeader>
                          <p className="py-4">
                            Are you sure you want to delete the container "{container.label}"? 
                            This will also remove all {container.fields.length} fields associated with this container.
                          </p>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button 
                              variant="destructive" 
                              onClick={() => handleDeleteContainer(container.id)}
                            >
                              Delete Container
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setExpandedContainer(expandedContainer === container.id ? null : container.id)}
                      >
                        {expandedContainer === container.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Container properties (visible when expanded) */}
                  {expandedContainer === container.id && (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300">Container Properties</h5>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <p className="font-medium text-gray-500 dark:text-gray-400">ID</p>
                          <p className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{container.id}</p>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="font-medium text-gray-500 dark:text-gray-400">Label</p>
                          <p className="text-gray-900 dark:text-gray-100">{container.label}</p>
                        </div>
                        
                        {container.shortLabel && (
                          <div className="space-y-1">
                            <p className="font-medium text-gray-500 dark:text-gray-400">Short Label</p>
                            <p className="text-gray-900 dark:text-gray-100">{container.shortLabel}</p>
                          </div>
                        )}
                        
                        <div className="space-y-1">
                          <p className="font-medium text-gray-500 dark:text-gray-400">Hide Description</p>
                          <p className="text-gray-900 dark:text-gray-100">{container.hideDescription ? 'Yes' : 'No'}</p>
                        </div>
                        
                        {container.gridCols && (
                          <div className="space-y-1">
                            <p className="font-medium text-gray-500 dark:text-gray-400">Grid Columns</p>
                            <p className="text-gray-900 dark:text-gray-100">{container.gridCols}</p>
                          </div>
                        )}
                      </div>
                      
                      {container.description && (
                        <div className="space-y-1">
                          <p className="font-medium text-gray-500 dark:text-gray-400">Description</p>
                          <p className="text-gray-900 dark:text-gray-100">{container.description}</p>
                        </div>
                      )}
                      
                      {container.helpText && (
                        <div className="space-y-1">
                          <p className="font-medium text-gray-500 dark:text-gray-400">Help Text</p>
                          <p className="text-gray-900 dark:text-gray-100">{container.helpText}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Fields list (always visible) */}
                  {container.fields.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fields</h5>
                      <div className="space-y-2">
                        {container.fields.map((field) => (
                          <div 
                            key={field.id}
                            className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md"
                          >
                            {editingFieldId === field.id && editingFieldContainerId === container.id ? (
                              // Edit mode for field
                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <h4 className="font-medium">Editing Field</h4>
                                  <div className="space-x-2">
                                    <Button variant="outline" size="sm" onClick={handleCancelFieldEdit}>
                                      Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleSaveField}>
                                      Save Changes
                                    </Button>
                                  </div>
                                </div>
                                
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="field-label">Label</Label>
                                    <Input 
                                      id="field-label"
                                      value={editField?.label || ''}
                                      onChange={(e) => handleFieldChange('label', e.target.value)}
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="field-key">Field Key</Label>
                                    <Input 
                                      id="field-key"
                                      value={editField?.id || ''}
                                      onChange={(e) => handleFieldChange('id', e.target.value)}
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="field-component">Component Type</Label>
                                    <Input 
                                      id="field-component"
                                      value={editField?.component || ''}
                                      onChange={(e) => handleFieldChange('component', e.target.value)}
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="field-placeholder">Placeholder</Label>
                                    <Input 
                                      id="field-placeholder"
                                      value={editField?.placeholder || ''}
                                      onChange={(e) => handleFieldChange('placeholder', e.target.value)}
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor="field-helpText">Help Text</Label>
                                    <Textarea 
                                      id="field-helpText"
                                      value={editField?.helpText || ''}
                                      onChange={(e) => handleFieldChange('helpText', e.target.value)}
                                    />
                                  </div>
                                  
                                  <div className="flex items-center space-x-2">
                                    <Checkbox 
                                      id="field-required" 
                                      checked={!!editField?.required}
                                      onCheckedChange={(checked) => handleFieldChange('required', !!checked)}
                                    />
                                    <Label htmlFor="field-required">Required</Label>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              // View mode for field
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field.label}</span>
                                  <Badge variant="outline" className="text-xs">{field.component}</Badge>
                                  {field.required && <Badge className="bg-blue-500 text-white text-xs">Required</Badge>}
                                </div>
                                <div className="flex space-x-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleEditField(container.id, field)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 w-8 p-0"
                                        onClick={() => handleStartFieldJsonEdit(container.id, field)}
                                      >
                                        <Code className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-xl">
                                      <DialogHeader>
                                        <DialogTitle>Edit Field JSON</DialogTitle>
                                      </DialogHeader>
                                      <div className="py-4">
                                        <textarea
                                          value={fieldJsonEditing?.fieldId === field.id ? fieldJsonEditing.json : JSON.stringify(field, null, 2)}
                                          onChange={(e) => handleFieldJsonChange(e.target.value)}
                                          className="w-full h-96 p-4 font-mono text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none border-border"
                                          spellCheck="false"
                                        />
                                      </div>
                                      <DialogFooter>
                                        <DialogClose asChild>
                                          <Button variant="outline">Cancel</Button>
                                        </DialogClose>
                                        <Button onClick={handleSaveFieldJson}>Save Changes</Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                  
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleRemoveField(container.id, field.id)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <X className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddField(container.id)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Field
                    </Button>
                  </div>
                  
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
} 