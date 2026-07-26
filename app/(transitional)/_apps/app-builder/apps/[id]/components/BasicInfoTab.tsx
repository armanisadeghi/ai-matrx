'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppName,
  selectAppDescription,
  selectAppCreator,
  selectAppSlug,
} from '@/lib/redux/app-builder/selectors/appSelectors';

interface BasicInfoTabProps {
  appId: string;
}

export default function BasicInfoTab({ appId }: BasicInfoTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const appName = useAppSelector((state) => selectAppName(state, appId));
  const appDescription = useAppSelector((state) => selectAppDescription(state, appId));
  const appCreator = useAppSelector((state) => selectAppCreator(state, appId));
  const appSlug = useAppSelector((state) => selectAppSlug(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
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
    </div>
  );
} 