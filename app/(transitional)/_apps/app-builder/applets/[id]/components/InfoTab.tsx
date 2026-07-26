'use client';

import React from 'react';
import { Card } from '@/components/ui/card';

interface InfoTabProps {
  id: string;
}

export default function InfoTab({ id }: InfoTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            This is a placeholder for the Info tab. Additional details about the applet will be displayed here.
          </p>
          
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Applet ID</p>
            <p className="text-gray-900 dark:text-gray-100">{id}</p>
          </div>
        </div>
      </Card>
    </div>
  );
} 