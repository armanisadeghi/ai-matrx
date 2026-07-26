'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppById } from '@/lib/redux/app-builder/selectors/appSelectors';
import { ScrollArea } from '@/components/ui/scroll-area';

interface JsonConfigTabProps {
  appId: string;
}

export default function JsonConfigTab({ appId }: JsonConfigTabProps) {
  // Get app from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Configuration (JSON)</h3>
        <ScrollArea className="h-[500px] rounded-md border-border">
          <pre className="p-4 text-sm bg-gray-50 dark:bg-gray-900 rounded-md overflow-auto">
            <code className="text-gray-800 dark:text-gray-300">
              {JSON.stringify(app, null, 2)}
            </code>
          </pre>
        </ScrollArea>
      </Card>
    </div>
  );
} 