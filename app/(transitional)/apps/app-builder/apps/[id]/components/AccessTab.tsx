'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppIsPublic,
  selectAppAuthenticatedRead,
  selectAppPublicRead,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Badge } from '@/components/ui/badge';

interface AccessTabProps {
  appId: string;
}

export default function AccessTab({ appId }: AccessTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const isPublic = useAppSelector((state) => selectAppIsPublic(state, appId));
  const authenticatedRead = useAppSelector((state) => selectAppAuthenticatedRead(state, appId));
  const publicRead = useAppSelector((state) => selectAppPublicRead(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="space-y-6">
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