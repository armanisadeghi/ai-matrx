'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppDataContext,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface AppDataContextEditTabProps {
  appId: string;
}

export default function AppDataContextEditTab({ appId }: AppDataContextEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appDataContext = useAppSelector((state) => selectAppDataContext(state, appId));
  
  // Create a formatted JSON string for the text area
  const [jsonText, setJsonText] = useState(
    appDataContext ? JSON.stringify(appDataContext, null, 2) : '{}'
  );
  
  const [error, setError] = useState<string | null>(null);

  if (!app) {
    return <div>App not found</div>;
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    // Clear any previous error when the text is changed
    setError(null);
  };

  const handleUpdateContext = () => {
    try {
      const parsedJSON = JSON.parse(jsonText);
      
      dispatch({ 
        type: "appBuilder/setAppDataContext", 
        payload: { 
          id: appId, 
          appDataContext: parsedJSON 
        } 
      });
      
      setError(null);
    } catch (e) {
      setError(`Invalid JSON format: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Data Context</h3>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="app-data-context" className="mb-2 block">
              JSON Data Context
            </Label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This shared data context will be available to all applets within this app.
            </p>
            
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <Textarea
              id="app-data-context"
              value={jsonText}
              onChange={handleTextChange}
              rows={15}
              className="font-mono text-sm"
            />
          </div>
          
          <div className="flex justify-end">
            <Button onClick={handleUpdateContext}>
              Update Context
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
} 