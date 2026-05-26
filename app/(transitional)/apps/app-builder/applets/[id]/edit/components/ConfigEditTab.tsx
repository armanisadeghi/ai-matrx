'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CustomAppletConfig } from '../../page';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ConfigEditTabProps {
  applet: CustomAppletConfig;
  onUpdate: (updatedApplet: CustomAppletConfig) => void;
}

export default function ConfigEditTab({ applet, onUpdate }: ConfigEditTabProps) {
  const [jsonValue, setJsonValue] = useState(JSON.stringify(applet, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonValue(e.target.value);
    setError(null);
  };

  const handleUpdate = () => {
    try {
      const parsedValue = JSON.parse(jsonValue);
      onUpdate(parsedValue);
      setError(null);
    } catch (err) {
      setError("Invalid JSON format. Please check your syntax.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div>
            <Textarea
              value={jsonValue}
              onChange={handleJsonChange}
              className="font-mono text-xs h-[70vh]"
            />
          </div>
          
          <div className="flex justify-end">
            <Button onClick={handleUpdate}>
              Update Configuration
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
} 