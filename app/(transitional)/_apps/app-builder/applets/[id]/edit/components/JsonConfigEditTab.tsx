'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { 
  selectAppletResultComponentConfig,
  selectAppletNextStepConfig
} from '@/lib/redux/app-builder/selectors/appletSelectors';
import {
  setResultComponentConfig,
  setNextStepConfig
} from '@/lib/redux/app-builder/slices/appletBuilderSlice';

interface JsonConfigEditTabProps {
  title: string;
  description?: string;
  appletId: string;
  configType: 'resultComponentConfig' | 'nextStepConfig';
}

export default function JsonConfigEditTab({
  title,
  description,
  appletId,
  configType
}: JsonConfigEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Select the appropriate data based on configType
  const data = useAppSelector(state => {
    if (configType === 'resultComponentConfig') {
      return selectAppletResultComponentConfig(state, appletId);
    } else {
      return selectAppletNextStepConfig(state, appletId);
    }
  });

  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);
  
  // Initialize the editor with the current data
  useEffect(() => {
    try {
      setJsonText(JSON.stringify(data, null, 2) || '{}');
      setError(null);
      setIsValid(true);
    } catch (err) {
      setJsonText('{}');
      setError('Failed to parse initial data');
      setIsValid(false);
    }
  }, [data]);
  
  // Update the validity when the JSON text changes
  const handleTextChange = (text: string) => {
    setJsonText(text);
    try {
      JSON.parse(text);
      setError(null);
      setIsValid(true);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid JSON');
      }
      setIsValid(false);
    }
  };
  
  // Apply the changes when the apply button is clicked
  const handleApply = () => {
    if (!isValid) return;
    
    try {
      const parsedData = JSON.parse(jsonText);
      
      if (configType === 'resultComponentConfig') {
        dispatch(setResultComponentConfig({ id: appletId, resultComponentConfig: parsedData }));
      } else {
        dispatch(setNextStepConfig({ id: appletId, nextStepConfig: parsedData }));
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update data');
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">{title}</h3>
        {description && <p className="text-gray-500 dark:text-gray-400">{description}</p>}
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Label htmlFor="json-editor">JSON Configuration</Label>
            <Button 
              onClick={handleApply} 
              disabled={!isValid}
              size="sm"
              className={!isValid ? "opacity-50" : ""}
            >
              <Check className="h-4 w-4" /> Apply Changes
            </Button>
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="border-border rounded-md">
            <textarea
              id="json-editor"
              value={jsonText}
              onChange={(e) => handleTextChange(e.target.value)}
              className="w-full h-[400px] p-4 font-mono text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              spellCheck="false"
            />
          </div>
          
          <div className="flex justify-end">
            <p className={`text-sm ${isValid ? 'text-green-500' : 'text-red-500'}`}>
              {isValid ? 'Valid JSON' : 'Invalid JSON'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
} 