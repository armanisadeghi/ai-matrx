'use client';

import React from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldDefinition } from '@/types/customAppTypes';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFieldLoading } from '@/lib/redux/app-builder/selectors/fieldSelectors';
import { useToast } from '@/components/ui/use-toast';
import SectionCard from '@/components/official/cards/SectionCard';
import EmptyStateCard from '@/components/official/cards/EmptyStateCard';
import { ListX } from 'lucide-react';
import { selectActiveContainerId } from '@/lib/redux/app-builder/selectors/containerSelectors';
import { removeFieldThunk } from '@/lib/redux/app-builder/thunks/containerBuilderThunks';
import { selectActiveAppletId } from '@/lib/redux/app-builder/selectors/appletSelectors';
import { recompileAppletThunk } from '@/lib/redux/app-builder/thunks/appletBuilderThunks';

interface FieldsListProps {
  fields: FieldDefinition[];
  title?: string;
  description?: string;
  onFieldRemoved?: () => void;
  containerId?: string; // Allow overriding the container ID
  onFieldClicked?: (fieldId: string) => void;
}

const FieldsList: React.FC<FieldsListProps> = ({ 
  fields, 
  title = "Configured Fields",
  description = "Fields in this group",
  onFieldRemoved,
  containerId,
  onFieldClicked,
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  
  // Redux state
  const fieldLoading = useAppSelector(selectFieldLoading);
  const activeContainerId = useAppSelector(selectActiveContainerId);
  const activeAppletId = useAppSelector(selectActiveAppletId);

  const handleRemoveField = async (fieldId: string) => {
    if (fieldId) {
      try {
        const containerIdToUse = containerId || activeContainerId;
        
        // First, remove the field from the container using the appropriate thunk
        if (containerIdToUse) {
          await dispatch(
            removeFieldThunk({
              containerId: containerIdToUse,
              fieldId: fieldId
            })
          ).unwrap();
          
          // Recompile the applet if we have an active applet
          if (activeAppletId) {
            await dispatch(recompileAppletThunk(activeAppletId)).unwrap();
          }
        }
        
        // Note: We intentionally do NOT delete the actual field component, just its connection to this container
        
        toast({
          title: "Field Removed",
          description: "Field has been removed from the container and applet recompiled",
        });
        
        // Notify parent component if callback provided
        if (onFieldRemoved) {
          onFieldRemoved();
        }
      } catch (error) {
        console.error("Error removing field:", error);
        toast({
          title: "Error",
          description: "Failed to remove field. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <SectionCard
      title={title}
      description={description}
    >
      <div className="px-1 py-2 max-h-[600px] overflow-y-auto">
        {fields.length === 0 ? (
          <EmptyStateCard
            icon={ListX}
            title="No Fields Yet"
            description="Fields you add to this container will appear here"
          />
        ) : (
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div 
                key={field.id || index}
                className="p-2 border-border rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                onClick={() => onFieldClicked && field.id && onFieldClicked(field.id)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{field.label}</h4>
                      <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {field.component || 'input'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[180px]">
                      {field.placeholder || 'No placeholder'}
                    </p>
                  </div>
                  
                  <Button
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveField(field.id);
                    }}
                    disabled={fieldLoading}
                    className="h-6 w-6 p-0 rounded-full text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                  >
                    {fieldLoading ? (
                      <span className="h-3 w-3 animate-spin">⌛</span>
                    ) : (
                      <XIcon className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default FieldsList;
