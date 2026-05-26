'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppIsPublic,
  selectAppAuthenticatedRead,
  selectAppPublicRead,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface AccessEditTabProps {
  appId: string;
}

export default function AccessEditTab({ appId }: AccessEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const isPublic = useAppSelector((state) => selectAppIsPublic(state, appId));
  const authenticatedRead = useAppSelector((state) => selectAppAuthenticatedRead(state, appId));
  const publicRead = useAppSelector((state) => selectAppPublicRead(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }

  // Handle toggle changes
  const handleToggleChange = (field: 'isPublic' | 'authenticatedRead' | 'publicRead', value: boolean) => {
    dispatch({ type: `appBuilder/set${field.charAt(0).toUpperCase()}${field.slice(1)}`, payload: { id: appId, [field]: value } });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Access Settings</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="is-public" className="block">Public App</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">Make this app visible in public listings</p>
            </div>
            <Switch
              id="is-public"
              checked={isPublic || false}
              onCheckedChange={(checked) => handleToggleChange('isPublic', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="authenticated-read" className="block">Authenticated Access</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allow access only to authenticated users</p>
            </div>
            <Switch
              id="authenticated-read"
              checked={authenticatedRead || false}
              onCheckedChange={(checked) => handleToggleChange('authenticatedRead', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="public-read" className="block">Public Read Access</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allow anyone to view this app without login</p>
            </div>
            <Switch
              id="public-read"
              checked={publicRead || false}
              onCheckedChange={(checked) => handleToggleChange('publicRead', checked)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
} 