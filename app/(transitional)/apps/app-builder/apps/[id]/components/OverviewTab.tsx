'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { AppBuilder } from '../page';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppName,
  selectAppDescription,
  selectAppCreator,
  selectAppSlug,
  selectAppImageUrl,
  selectAppPrimaryColor,
  selectAppAccentColor,
  selectAppMainAppIcon,
  selectAppIsPublic,
  selectAppAuthenticatedRead,
  selectAppPublicRead,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { getAppIcon } from '@/features/applet/styles/StyledComponents';

interface OverviewTabProps {
  appId: string;
}

export default function OverviewTab({ appId }: OverviewTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appName = useAppSelector((state) => selectAppName(state, appId));
  const appDescription = useAppSelector((state) => selectAppDescription(state, appId));
  const appCreator = useAppSelector((state) => selectAppCreator(state, appId));
  const appSlug = useAppSelector((state) => selectAppSlug(state, appId));
  const appImageUrl = useAppSelector((state) => selectAppImageUrl(state, appId));
  const primaryColor = useAppSelector((state) => selectAppPrimaryColor(state, appId));
  const accentColor = useAppSelector((state) => selectAppAccentColor(state, appId));
  const mainAppIcon = useAppSelector((state) => selectAppMainAppIcon(state, appId));
  const isPublic = useAppSelector((state) => selectAppIsPublic(state, appId));
  const authenticatedRead = useAppSelector((state) => selectAppAuthenticatedRead(state, appId));
  const publicRead = useAppSelector((state) => selectAppPublicRead(state, appId));

  // This is incorrect. Need to use the styles utility to get the actual icon, given the colors and size...
  const IconComponent = getAppIcon({
    icon: mainAppIcon,
    size: 16,
    color: accentColor,
  })

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Basic Information</h3>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
              <p className="text-gray-900 dark:text-gray-100">{appName || "Untitled App"}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Slug</p>
              <p className="text-gray-900 dark:text-gray-100">{appSlug || "No slug set"}</p>
            </div>
            
            {appCreator && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created by</p>
                <p className="text-gray-900 dark:text-gray-100">{appCreator}</p>
              </div>
            )}

            {appDescription && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
                <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{appDescription}</p>
              </div>
            )}
          </div>
        </Card>
        
        {/* Visual Details */}
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
      
      {/* Access Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Access Settings</h3>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Visibility</p>
            <div className="flex space-x-2">
              {isPublic ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                  Public
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                  Private
                </Badge>
              )}
              
              {authenticatedRead && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                  Authenticated Users
                </Badge>
              )}
              
              {publicRead && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                  Public Read
                </Badge>
              )}
            </div>
          </div>
          
          {app.createdAt && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
              <p className="text-gray-900 dark:text-gray-100">
                {new Date(app.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}
          
          {app.updatedAt && (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</p>
              <p className="text-gray-900 dark:text-gray-100">
                {new Date(app.updatedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 