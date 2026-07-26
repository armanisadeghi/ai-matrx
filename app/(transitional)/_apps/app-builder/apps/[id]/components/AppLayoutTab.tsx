'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppById, selectAppLayoutType } from '@/lib/redux/app-builder/selectors/appSelectors';
import { AppLayoutOptions } from '../page';
import { CheckCircle } from 'lucide-react';

interface AppLayoutTabProps {
  appId: string;
}

const layoutDescriptions: Record<AppLayoutOptions, string> = {
  tabbedApplets: 'Displays applets in a tabbed interface, allowing users to switch between different applets.',
  singleDropdown: 'Uses a dropdown menu for applet selection, showing one applet at a time.',
  multiDropdown: 'Provides multiple dropdown menus for organizing applets into categories.',
  singleDropdownWithSearch: 'Combines a dropdown with search functionality for easier applet finding.',
  icons: 'Presents applets as clickable icons, providing a visual app-like experience.',
};

export default function AppLayoutTab({ appId }: AppLayoutTabProps) {
  // Get app layout data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const layoutType = useAppSelector((state) => selectAppLayoutType(state, appId));
  
  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Layout Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Layout Type</p>
            <p className="text-gray-900 dark:text-gray-100 font-medium mt-1">
              {layoutType ? (
                <span className="capitalize">{layoutType.replace(/([A-Z])/g, ' $1').trim()}</span>
              ) : (
                'Default Layout'
              )}
            </p>
          </div>
          
          {layoutType && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
              <p className="text-gray-800 dark:text-gray-200 mt-1">
                {layoutDescriptions[layoutType as AppLayoutOptions] || 'Custom layout configuration.'}
              </p>
            </div>
          )}
        </div>
      </Card>
      
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Available Layout Options</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(layoutDescriptions).map(([type, description]) => (
            <div 
              key={type}
              className={`p-4 rounded-md border ${
                layoutType === type 
                  ? 'border-primary bg-primary/5' 
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                    {type.replace(/([A-Z])/g, ' $1').trim()}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
                </div>
                {layoutType === type && (
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      
      {app.extraButtons && app.extraButtons.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Extra Action Buttons</h3>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This app has {app.extraButtons.length} custom action button{app.extraButtons.length !== 1 ? 's' : ''} configured.
            </p>
            
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {app.extraButtons.map((button, index) => (
                <li key={index} className="py-3">
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
        </Card>
      )}
    </div>
  );
} 