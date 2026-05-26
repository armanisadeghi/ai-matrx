'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppName,
  selectAppImageUrl,
  selectAppPrimaryColor,
  selectAppAccentColor,
  selectAppMainAppIcon,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Label } from '@/components/ui/label';
import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';
import { TailwindColorPicker } from '@/components/ui/TailwindColorPicker';
import { IconPicker } from '@/components/ui/IconPicker';
import { setMainAppIcon } from '@/lib/redux/app-builder/slices/appBuilderSlice';

interface VisualDetailsEditTabProps {
  appId: string;
}

export default function VisualDetailsEditTab({ appId }: VisualDetailsEditTabProps) {
  const dispatch = useAppDispatch();
  
  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appName = useAppSelector((state) => selectAppName(state, appId));
  const appImageUrl = useAppSelector((state) => selectAppImageUrl(state, appId));
  const primaryColor = useAppSelector((state) => selectAppPrimaryColor(state, appId));
  const accentColor = useAppSelector((state) => selectAppAccentColor(state, appId));
  const mainAppIcon = useAppSelector((state) => selectAppMainAppIcon(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }
  
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

  return (
    <div className="space-y-6">
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
  );
} 