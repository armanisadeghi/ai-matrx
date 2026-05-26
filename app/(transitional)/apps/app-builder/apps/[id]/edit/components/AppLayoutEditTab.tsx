'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppById, selectAppLayoutType } from '@/lib/redux/app-builder/selectors/appSelectors';
import { AppLayoutOptions } from '../../page';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface AppLayoutEditTabProps {
  appId: string;
}

const layoutDescriptions: Record<AppLayoutOptions, string> = {
  tabbedApplets: 'Displays applets in a tabbed interface, allowing users to switch between different applets.',
  singleDropdown: 'Uses a dropdown menu for applet selection, showing one applet at a time.',
  multiDropdown: 'Provides multiple dropdown menus for organizing applets into categories.',
  singleDropdownWithSearch: 'Combines a dropdown with search functionality for easier applet finding.',
  icons: 'Presents applets as clickable icons, providing a visual app-like experience.',
};

export default function AppLayoutEditTab({ appId }: AppLayoutEditTabProps) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId));
  const layoutType = useAppSelector((state) => selectAppLayoutType(state, appId));
  
  if (!app) {
    return <div>App not found</div>;
  }
  
  const handleLayoutChange = (value: string) => {
    dispatch({ 
      type: 'appBuilder/setLayoutType', 
      payload: { 
        id: appId, 
        layoutType: value as AppLayoutOptions 
      } 
    });
  };
  
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Layout Configuration</h3>
        
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Choose the layout type for displaying applets in your app.
          </p>
          
          <RadioGroup 
            value={layoutType || ''} 
            onValueChange={handleLayoutChange}
            className="space-y-4"
          >
            {Object.entries(layoutDescriptions).map(([type, description]) => (
              <div key={type} className="flex items-start space-x-2 p-4 rounded-md border-border hover:bg-gray-50 dark:hover:bg-gray-800">
                <RadioGroupItem value={type} id={`layout-${type}`} className="mt-1" />
                <div className="flex-1">
                  <Label 
                    htmlFor={`layout-${type}`} 
                    className="font-medium text-gray-900 dark:text-gray-100 capitalize cursor-pointer"
                  >
                    {type.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>
      </Card>
      
      {/* Extra Buttons Configuration Card */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Extra Action Buttons</h3>
        
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Configure extra action buttons via the JSON editor. Advanced feature for custom app behaviors.
          </p>
          
          {app.extraButtons && app.extraButtons.length > 0 ? (
            <div className="border-border rounded-md">
              <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-border">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Extra Buttons</h4>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {app.extraButtons.map((button, index) => (
                  <li key={index} className="p-4">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{button.label}</span>
                      {button.actionType && (
                        <span className="ml-2 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {button.actionType}
                        </span>
                      )}
                    </div>
                    {button.knownMethod && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Action: {button.knownMethod}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
              <p className="text-gray-500 dark:text-gray-400">No extra buttons configured.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Use the JSON editor tab to add custom action buttons.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 