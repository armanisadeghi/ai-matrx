'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppName,
  selectAppImageUrl,
  selectAppPrimaryColor,
  selectAppAccentColor,
  selectAppMainAppIcon,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import Image from 'next/image';
import { getAppIcon } from '@/features/applet/styles/StyledComponents';

interface VisualDetailsTabProps {
  appId: string;
}

export default function VisualDetailsTab({ appId }: VisualDetailsTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appName = useAppSelector((state) => selectAppName(state, appId));
  const appImageUrl = useAppSelector((state) => selectAppImageUrl(state, appId));
  const primaryColor = useAppSelector((state) => selectAppPrimaryColor(state, appId));
  const accentColor = useAppSelector((state) => selectAppAccentColor(state, appId));
  const mainAppIcon = useAppSelector((state) => selectAppMainAppIcon(state, appId));

  // Get the icon component based on the app's icon, colors, and size
  const IconComponent = getAppIcon({
    icon: mainAppIcon,
    size: 16,
    color: accentColor,
  });

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Visual Details</h3>
        
        <div className="space-y-4">
          {appImageUrl && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">App Image</p>
              <div className="relative w-full h-40 rounded-md overflow-hidden">
                <Image
                  src={appImageUrl}
                  alt={appName || "App image"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
            </div>
          )}
          
          <div className="flex space-x-6">
            {primaryColor && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Primary Color</p>
                <div
                  className="w-8 h-8 rounded border-border mt-1"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
            )}
            
            {accentColor && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Accent Color</p>
                <div
                  className="w-8 h-8 rounded border-border mt-1"
                  style={{ backgroundColor: accentColor }}
                />
              </div>
            )}
          </div>
          
          {IconComponent && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">App Icon</p>
              <div className="mt-1 p-2 inline-block rounded-md bg-gray-100 dark:bg-gray-800">
                {IconComponent}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 