'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface JsonConfigTabProps {
  title: string;
  description?: string;
  data: any;
  emptyMessage?: string;
}

export default function JsonConfigTab({ 
  title, 
  description, 
  data, 
  emptyMessage = 'No configuration data available.' 
}: JsonConfigTabProps) {
  const [prettify, setPrettify] = useState(true);
  
  if (!data) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-end space-x-2">
          <Switch 
            id="pretty-json" 
            checked={prettify}
            onCheckedChange={setPrettify}
          />
          <Label htmlFor="pretty-json">Pretty Print</Label>
        </div>
        
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 overflow-hidden">
          <pre className="p-4 overflow-auto text-xs text-gray-900 dark:text-gray-100 max-h-[500px]">
            {prettify 
              ? JSON.stringify(data, null, 2) 
              : JSON.stringify(data)}
          </pre>
        </div>
      </Card>
    </div>
  );
} 