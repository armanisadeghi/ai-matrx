'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppCreatedAt,
  selectAppUpdatedAt,
  selectAppUserId,
  selectAppIsDirty,
  selectAppIsLocal,
  selectAppSlugStatus,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Badge } from '@/components/ui/badge';

interface AdditionalInfoTabProps {
  appId: string;
}

export default function AdditionalInfoTab({ appId }: AdditionalInfoTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const createdAt = useAppSelector((state) => selectAppCreatedAt(state, appId));
  const updatedAt = useAppSelector((state) => selectAppUpdatedAt(state, appId));
  const userId = useAppSelector((state) => selectAppUserId(state, appId));
  const isDirty = useAppSelector((state) => selectAppIsDirty(state, appId));
  const isLocal = useAppSelector((state) => selectAppIsLocal(state, appId));
  const slugStatus = useAppSelector((state) => selectAppSlugStatus(state, appId));

  if (!app) {
    return <div>App not found</div>;
  }

  const getSlugStatusBadge = (status?: string) => {
    switch (status) {
      case 'unique':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
            Unique
          </Badge>
        );
      case 'notUnique':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
            Not Unique
          </Badge>
        );
      case 'unchecked':
      default:
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
            Unchecked
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">Additional Information</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Technical Info */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700 dark:text-gray-300">System Info</h4>
              
              {userId && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">User ID</p>
                  <p className="text-gray-900 dark:text-gray-100 text-sm font-mono">{userId}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">App ID</p>
                <p className="text-gray-900 dark:text-gray-100 text-sm font-mono">{appId}</p>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Slug Status:</p>
                  {getSlugStatusBadge(slugStatus)}
                </div>
                
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Has Unsaved Changes:</p>
                  {isDirty ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                      No
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Is Local Only:</p>
                  {isLocal ? (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                      No
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            {/* Timestamps */}
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700 dark:text-gray-300">Timestamps</h4>
              
              {createdAt && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {new Date(createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
              
              {updatedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {new Date(updatedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
              
              {createdAt && updatedAt && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Age</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {getTimeDifference(createdAt, new Date().toISOString())}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Helper function to calculate time difference in a human-readable format
function getTimeDifference(startDate: string, endDate: string): string {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const diffInMs = Math.abs(end - start);
  
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (diffInDays > 365) {
    const years = Math.floor(diffInDays / 365);
    const remainingDays = diffInDays % 365;
    return `${years} year${years !== 1 ? 's' : ''} and ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
  } else if (diffInDays > 30) {
    const months = Math.floor(diffInDays / 30);
    const remainingDays = diffInDays % 30;
    return `${months} month${months !== 1 ? 's' : ''} and ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
  } else if (diffInDays > 0) {
    return `${diffInDays} day${diffInDays !== 1 ? 's' : ''}`;
  } else {
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''}`;
    } else {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''}`;
    }
  }
} 