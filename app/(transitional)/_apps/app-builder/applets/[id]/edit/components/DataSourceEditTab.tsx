'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { selectAppletDataSourceConfig } from '@/lib/redux/app-builder/selectors/appletSelectors';
import { setDataSourceConfig } from '@/lib/redux/app-builder/slices/appletBuilderSlice';

interface DataSourceEditTabProps {
  appletId: string;
}

export default function DataSourceEditTab({ appletId }: DataSourceEditTabProps) {
  const dispatch = useAppDispatch();
  const dataSourceConfig = useAppSelector(state => selectAppletDataSourceConfig(state, appletId)) || {};
  
  const sourceTypes = ['recipe', 'workflow', 'api', 'database', 'other'];
  
  const handleSourceTypeChange = (type: string) => {
    dispatch(setDataSourceConfig({
      id: appletId,
      dataSourceConfig: {
        ...dataSourceConfig,
        sourceType: type,
        config: dataSourceConfig.config || { id: `${type}-config-${Date.now()}` } as any
      } as any
    }));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">Data Source Type</Label>
            <Select
              value={dataSourceConfig.sourceType || ''}
              onValueChange={handleSourceTypeChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent>
                {sourceTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {dataSourceConfig.sourceType && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {dataSourceConfig.sourceType.charAt(0).toUpperCase() + dataSourceConfig.sourceType.slice(1)} Configuration
                </Label>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
              
              {dataSourceConfig.config ? (
                <pre className="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded overflow-auto text-xs text-gray-900 dark:text-gray-100">
                  {JSON.stringify(dataSourceConfig.config, null, 2)}
                </pre>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  No configuration data available.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 