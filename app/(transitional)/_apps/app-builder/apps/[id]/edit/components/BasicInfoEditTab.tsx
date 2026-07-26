'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppName,
  selectAppDescription,
  selectAppSlug,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { convertToKebabCase } from '@/utils/text/stringUtils';
import { setName, setDescription, setSlug } from '@/lib/redux/app-builder/slices/appBuilderSlice';

interface BasicInfoEditTabProps {
  appId: string;
}

export default function BasicInfoEditTab({ appId }: BasicInfoEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appName = useAppSelector((state) => selectAppName(state, appId));
  const appDescription = useAppSelector((state) => selectAppDescription(state, appId));
  const appSlug = useAppSelector((state) => selectAppSlug(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }
  
  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === "name") {
      dispatch(setName({ id: appId, name: value }));
      
      // Auto-generate slug from name if empty
      if (!appSlug) {
        const slug = convertToKebabCase(value);
        dispatch(setSlug({ id: appId, slug }));
      }
    } else if (name === "description") {
      dispatch(setDescription({ id: appId, description: value }));
    } else if (name === "slug") {
      dispatch(setSlug({ id: appId, slug: value }));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Basic Information</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">App Name</Label>
            <Input
              id="app-name"
              name="name"
              value={appName || ""}
              onChange={handleInputChange}
              placeholder="Enter app name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="app-slug">URL Slug</Label>
            <Input
              id="app-slug"
              name="slug"
              value={appSlug || ""}
              onChange={handleInputChange}
              placeholder="app-url-slug"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This will be used in the URL: /apps/{appSlug || "app-slug"}
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="app-description">Description</Label>
            <Textarea
              id="app-description"
              name="description"
              value={appDescription || ""}
              onChange={handleInputChange}
              placeholder="Describe your app"
              rows={5}
            />
          </div>
        </div>
      </Card>
    </div>
  );
} 