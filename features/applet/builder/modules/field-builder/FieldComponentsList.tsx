'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
import { fetchFieldsThunk, deleteFieldThunk, setFieldPublicThunk } from '@/lib/redux/app-builder/thunks/fieldBuilderThunks';
import { setActiveField } from '@/lib/redux/app-builder/slices/fieldBuilderSlice';
import { selectAllFields, selectFieldLoading, selectFieldError, selectActiveFieldId } from '@/lib/redux/app-builder/selectors/fieldSelectors';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Loader2 } from "lucide-react";
import FieldComponentCard from "./FieldComponentCard";
import GroupSelectorOverlay from '@/features/applet/builder/modules/smart-parts/containers/GroupSelectorOverlay';
import { duplicateFieldComponent } from '@/lib/redux/app-builder/service/fieldComponentService';
import React from 'react';
import { FieldBuilder } from '@/lib/redux/app-builder/types';
import { ComponentGroup } from '@/types/customAppTypes';

interface FieldComponentsListProps {
  // List of fields (optional - will use Redux state if not provided)
  fields?: FieldBuilder[];
  
  // Loading state (optional - will use Redux state if not provided)
  isLoading?: boolean;
  
  // Selection callback
  onFieldSelected?: (fieldId: string) => void;
  
  // Navigation/action handlers (optional - will use router by default)
  onCreateNew?: () => void;
  onEditField?: (id: string) => void;
  onDeleteField?: (id: string) => void;
  onDuplicateField?: (id: string) => void;
}

export default function FieldComponentsList({ 
  fields: propFields,
  isLoading: propLoading,
  onFieldSelected,
  onCreateNew,
  onEditField,
  onDeleteField,
  onDuplicateField
}: FieldComponentsListProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  
  // Redux state (fallback if props not provided)
  const reduxFields = useAppSelector(selectAllFields);
  const reduxLoading = useAppSelector(selectFieldLoading);
  const error = useAppSelector(selectFieldError);
  const activeFieldId = useAppSelector(selectActiveFieldId);
  
  // Use props if provided, otherwise use Redux state
  const fields = propFields || reduxFields;
  const loading = propLoading !== undefined ? propLoading : reduxLoading;
  
  // Local state for search
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // State for group selector overlay
  const [showGroupSelector, setShowGroupSelector] = React.useState(false);
  const [selectedFieldId, setSelectedFieldId] = React.useState<string | null>(null);

  useEffect(() => {
    // Only load components if fields are not provided as props
    if (!propFields) {
      dispatch(fetchFieldsThunk());
    }
  }, [dispatch, propFields]);

  // Handlers with fallback to router behavior
  const handleCreateNew = () => {
    if (onCreateNew) {
      onCreateNew();
    } else {
      router.push('/apps/builder/unified-concept/create');
    }
  };

  const handleEdit = (id: string) => {
    if (onEditField) {
      onEditField(id);
    } else {
      router.push(`/apps/builder/unified-concept/edit/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this field component?')) return;
    
    try {
      // If parent provided delete handler, call it first
      if (onDeleteField) {
        onDeleteField(id);
        return; // Let the parent handle the Redux action
      }
      
      // Otherwise perform the Redux delete operation
      await dispatch(deleteFieldThunk(id)).unwrap();
      
      // If the deleted field was active, clear the active field
      if (activeFieldId === id) {
        dispatch(setActiveField(null));
      }
    } catch (err) {
      console.error('Failed to delete component:', err);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      // Call the service to duplicate the component
      const newComponent = await duplicateFieldComponent(id);
      
      // If parent provided duplicate handler, call it with the new component
      if (onDuplicateField) {
        onDuplicateField(newComponent.id);
        return; // Let the parent handle any refresh
      }
      
      // Otherwise refresh the fields list after duplication
      dispatch(fetchFieldsThunk());
    } catch (err) {
      console.error('Failed to duplicate component:', err);
    }
  };

  const handlePublicToggle = async (id: string, isPublic: boolean) => {
    try {
      await dispatch(setFieldPublicThunk({ id, isPublic })).unwrap();
      
      // Only refresh if we're not using prop-provided fields
      if (!propFields) {
        dispatch(fetchFieldsThunk());
      }
    } catch (err) {
      console.error('Failed to update component visibility:', err);
    }
  };
  
  const handleSelectField = (id: string) => {
    // Original selection logic - select the field but don't show overlay
    dispatch(setActiveField(id));
    
    // Notify parent component if callback provided
    if (onFieldSelected) {
      onFieldSelected(id);
    }
  };
  
  // Handler for "Add to Container" button click
  const handleAssignToContainer = (id: string) => {
    setSelectedFieldId(id);
    setShowGroupSelector(true);
  };
  
  // Handle container/group selection
  const handleGroupSelected = (group: ComponentGroup) => {
    console.log(`Assigning field ${selectedFieldId} to container ${group.id}`, { field: selectedFieldId, container: group });
    setShowGroupSelector(false);
    // Logic for handling container assignment will be added later
  };

  const filteredComponents = fields.filter((comp: FieldBuilder) =>
    comp.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    comp.component.toLowerCase().includes(searchTerm.toLowerCase()) ||
    idMatchesQuery(comp, searchTerm)
  );

  return (
    <div className="w-full min-h-screen bg-background p-3">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Field Components Library</h1>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search components..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-[300px]"
              />
            </div>
            
            <Button 
              onClick={handleCreateNew}
              className="whitespace-nowrap"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredComponents.length === 0 ? (
          /* Empty State */
          <Card className="text-center py-16">
            <CardContent>
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-medium">
                  {searchTerm 
                    ? 'No components match your search' 
                    : 'No field components yet'}
                </h3>
                <p className="text-muted-foreground mt-2 mb-6">
                  {searchTerm 
                    ? 'Try adjusting your search or create a new component' 
                    : 'Get started by creating your first field component'}
                </p>
                <Button
                  onClick={handleCreateNew}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Component
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Component Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredComponents.map((component) => (
              <FieldComponentCard
                key={component.id}
                component={component}
                isSelected={component.id === activeFieldId}
                onEdit={() => handleEdit(component.id)}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onPublicToggle={handlePublicToggle}
                onSelect={() => handleSelectField(component.id)}
                onAssignToContainer={handleAssignToContainer}
              />
            ))}
          </div>
        )}
        
        {/* Group Selector Overlay */}
        {showGroupSelector && selectedFieldId && (
          <GroupSelectorOverlay
            defaultOpen={true}
            dialogTitle="Add Field to Container"
            onGroupSelected={handleGroupSelected}
          />
        )}
      </div>
    </div>
  );
}