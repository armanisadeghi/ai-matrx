'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppById } from '@/lib/redux/app-builder/selectors/appSelectors';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Save } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

interface JsonConfigEditTabProps {
  appId: string;
}

export default function JsonConfigEditTab({ appId }: JsonConfigEditTabProps) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId));
  
  const [jsonValue, setJsonValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Initialize the JSON editor with the current app data
  useEffect(() => {
    if (app) {
      try {
        setJsonValue(JSON.stringify(app, null, 2));
        setError(null);
      } catch (err) {
        setError('Failed to parse app data to JSON');
      }
    }
  }, [app]);
  
  // Handle JSON editor changes
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonValue(e.target.value);
    setError(null);
  };
  
  // Apply JSON changes to the app
  const handleApplyChanges = () => {
    try {
      const parsedJson = JSON.parse(jsonValue);
      
      // Validate that this is an app object
      if (!parsedJson.id || parsedJson.id !== appId) {
        setError('Invalid app data: ID must match the current app');
        return;
      }
      
      // Update the app state with the parsed JSON
      dispatch({ type: 'appBuilder/updateAppFromJson', payload: parsedJson });
      setError(null);
    } catch (err) {
      setError('Invalid JSON: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Edit App Configuration (JSON)</h3>
        
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Edit the JSON configuration directly. This is an advanced feature.
          </p>
          
          <ScrollArea className="h-[500px] rounded-md border-border">
            <Textarea
              value={jsonValue}
              onChange={handleJsonChange}
              className="font-mono text-sm min-h-[500px] resize-none border-none focus-visible:ring-0"
              placeholder="// App configuration in JSON format"
              spellCheck={false}
            />
          </ScrollArea>
          
          <div className="flex justify-end">
            <Button 
              onClick={handleApplyChanges}
              className="flex items-center"
            >
              <Save className="h-4 w-4 mr-2" /> Apply Changes
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
} 