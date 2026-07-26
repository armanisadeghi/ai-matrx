'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppDataContext,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AppDataContextTabProps {
  appId: string;
}

export default function AppDataContextTab({ appId }: AppDataContextTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appDataContext = useAppSelector((state) => selectAppDataContext(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }

  // Format the appDataContext as pretty JSON
  const formattedJson = appDataContext ? 
    JSON.stringify(appDataContext, null, 2) : 
    '{}';

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Data Context</h3>
        
        {appDataContext && Object.keys(appDataContext).length > 0 ? (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This is the shared data context available to all applets within this app.
            </p>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-md">
              <ScrollArea className="h-96 w-full rounded-md border-border">
                <pre className="p-4 text-sm text-gray-800 dark:text-gray-200 font-mono">
                  {formattedJson}
                </pre>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="text-center p-6 text-gray-500 dark:text-gray-400">
            <p>No data context configured for this app</p>
            <p className="text-sm mt-2">App data context provides shared data that all applets in this app can access.</p>
          </div>
        )}
      </Card>
    </div>
  );
} 