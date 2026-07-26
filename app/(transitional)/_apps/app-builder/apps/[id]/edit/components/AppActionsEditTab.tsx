'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppExtraButtons,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { CustomActionButton } from '../../page';

interface AppActionsEditTabProps {
  appId: string;
}

export default function AppActionsEditTab({ appId }: AppActionsEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const extraButtons = useAppSelector((state) => selectAppExtraButtons(state, appId)) || [];

  if (!app) {
    return <div>App not found</div>;
  }

  // Placeholder for adding a new action button
  const handleAddActionButton = () => {
    const newButton: CustomActionButton = {
      label: "New Action",
      actionType: "button",
      knownMethod: "none",
    };
    
    dispatch({ 
      type: "appBuilder/setExtraButtons", 
      payload: { 
        id: appId, 
        extraButtons: [...extraButtons, newButton] 
      } 
    });
  };

  // Placeholder for removing an action button
  const handleRemoveActionButton = (index: number) => {
    const updatedButtons = [...extraButtons];
    updatedButtons.splice(index, 1);
    
    dispatch({ 
      type: "appBuilder/setExtraButtons", 
      payload: { 
        id: appId, 
        extraButtons: updatedButtons 
      } 
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">App Actions</h3>
          <Button 
            size="sm"
            variant="outline"
            onClick={handleAddActionButton}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Action
          </Button>
        </div>
        
        {extraButtons.length > 0 ? (
          <div className="space-y-4">
            {extraButtons.map((button, index) => (
              <div key={index} className="border-border rounded-md p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">{button.label}</h4>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleRemoveActionButton(index)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Complete action button editor coming soon...
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-md">
            <p className="text-gray-500 dark:text-gray-400">
              No custom actions configured for this app.
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Click "Add Action" to create custom action buttons for your app.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
} 