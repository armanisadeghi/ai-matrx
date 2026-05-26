'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { CustomAppletConfig } from '../page';

interface ConfigTabProps {
  applet: CustomAppletConfig;
}

export default function ConfigTab({ applet }: ConfigTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="relative">
          <pre className="overflow-auto p-4 bg-zinc-100 dark:bg-zinc-900 rounded-md text-xs text-gray-800 dark:text-gray-200 max-h-[70vh]">
            {JSON.stringify(applet, null, 2)}
          </pre>
        </div>
      </Card>
    </div>
  );
} 