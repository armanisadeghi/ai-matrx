'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppName,
  selectAppDescription,
  selectAppSlug,
  selectAppImageUrl,
  selectAppPrimaryColor,
  selectAppAccentColor,
  selectAppMainAppIcon,
  selectAppIsPublic,
  selectAppAuthenticatedRead,
  selectAppPublicRead,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';
import { TailwindColorPicker } from '@/components/ui/TailwindColorPicker';
import { IconPicker } from '@/components/ui/IconPicker';
import { Switch } from '@/components/ui/switch';
import { convertToKebabCase } from '@/utils/text/stringUtils';
import { setName, setDescription, setSlug, setMainAppIcon } from '@/lib/redux/app-builder/slices/appBuilderSlice';

interface OverviewEditTabProps {
  appId: string;
}

export default function OverviewEditTab({ appId }: OverviewEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appName = useAppSelector((state) => selectAppName(state, appId));
  const appDescription = useAppSelector((state) => selectAppDescription(state, appId));
  const appSlug = useAppSelector((state) => selectAppSlug(state, appId));
  const appImageUrl = useAppSelector((state) => selectAppImageUrl(state, appId));
  const primaryColor = useAppSelector((state) => selectAppPrimaryColor(state, appId));
  const accentColor = useAppSelector((state) => selectAppAccentColor(state, appId));
  const mainAppIcon = useAppSelector((state) => selectAppMainAppIcon(state, appId));
  const isPublic = useAppSelector((state) => selectAppIsPublic(state, appId));
  const authenticatedRead = useAppSelector((state) => selectAppAuthenticatedRead(state, appId));
  const publicRead = useAppSelector((state) => selectAppPublicRead(state, appId));

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

  // Handle color changes
  const handleColorChange = (colorType: "primary" | "accent", color: string) => {
    if (colorType === "primary") {
      dispatch({ type: "appBuilder/setPrimaryColor", payload: { id: appId, primaryColor: color } });
    } else {
      dispatch({ type: "appBuilder/setAccentColor", payload: { id: appId, accentColor: color } });
    }
  };

  // Handle image selection
  const handleImageSelected = (imageUrl: string) => {
    dispatch({ type: "appBuilder/setImageUrl", payload: { id: appId, imageUrl } });
  };

  // Handle image removal
  const handleImageRemoved = () => {
    dispatch({ type: "appBuilder/setImageUrl", payload: { id: appId, imageUrl: "" } });
  };

  // Handle icon selection
  const handleAppIconSelect = (iconName: string) => {
    dispatch(setMainAppIcon({ id: appId, mainAppIcon: iconName }));
  };

  // Handle toggle changes
  const handleToggleChange = (field: 'isPublic' | 'authenticatedRead' | 'publicRead', value: boolean) => {
    dispatch({ type: `appBuilder/set${field.charAt(0).toUpperCase()}${field.slice(1)}`, payload: { id: appId, [field]: value } });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
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
        
        {/* Visual Settings */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Visual Settings</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>App Image</Label>
              <SingleImageSelect
                size="sm"
                aspectRatio="landscape"
                placeholder="Select App Image"
                onImageSelected={handleImageSelected}
                onImageRemoved={handleImageRemoved}
                initialTab="public-search"
                initialSearchTerm={appName}
                preselectedImageUrl={appImageUrl}
                className="w-full"
                instanceId={`app-image-${appId}`}
                saveTo="public"
              />
            </div>
            
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <Label>Primary Color</Label>
                <TailwindColorPicker
                  selectedColor={primaryColor || "#3b82f6"}
                  onColorChange={(color) => handleColorChange("primary", color)}
                  size="sm"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label>Accent Color</Label>
                <TailwindColorPicker
                  selectedColor={accentColor || "#f43f5e"}
                  onColorChange={(color) => handleColorChange("accent", color)}
                  size="sm"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label>App Icon</Label>
                <IconPicker
                  iconType="appIcon"
                  selectedIcon={mainAppIcon}
                  onIconSelect={handleAppIconSelect}
                  primaryColor={primaryColor}
                  accentColor={accentColor}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Access Settings */}
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