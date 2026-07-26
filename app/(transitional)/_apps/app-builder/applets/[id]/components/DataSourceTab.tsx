'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletDataSourceConfig } from '@/lib/redux/app-builder/selectors/appletSelectors';

interface DataSourceTabProps {
  appletId: string;
}

export default function DataSourceTab({ appletId }: DataSourceTabProps) {
  const dataSourceConfig = useAppSelector(state => selectAppletDataSourceConfig(state, appletId));
  
  const isEmpty = !dataSourceConfig || !dataSourceConfig.sourceType;
  
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          {isEmpty ? (
            <p className="text-gray-500 dark:text-gray-400">No data source configuration defined for this applet.</p>
          ) : (
            <div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Source Type</p>
                  <p className="text-gray-900 dark:text-gray-100">{dataSourceConfig.sourceType}</p>
                </div>
                
                {dataSourceConfig.config && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Configuration</p>
                    <pre className="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded overflow-auto text-xs text-gray-900 dark:text-gray-100">
                      {JSON.stringify(dataSourceConfig.config, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 