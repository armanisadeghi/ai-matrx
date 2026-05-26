'use client';

import React from 'react';
import { Card } from '@/components/ui/card';

interface AppTabProps {
  appId?: string;
  subcategoryId?: string;
}

export default function AppTab({ appId, subcategoryId }: AppTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">App ID</p>
            <p className="text-gray-900 dark:text-gray-100">{appId || 'Not associated with an app'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Subcategory ID</p>
            <p className="text-gray-900 dark:text-gray-100">{subcategoryId || 'No subcategory assigned'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
} 