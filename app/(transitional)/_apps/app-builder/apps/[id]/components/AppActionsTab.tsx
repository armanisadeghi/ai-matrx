'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppExtraButtons,
} from '@/lib/redux/app-builder/selectors/appSelectors';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle, 
  ArrowRight, 
  Link, 
  ExternalLink, 
  Code
} from 'lucide-react';
import { CustomActionButton } from '../page';

interface AppActionsTabProps {
  appId: string;
}

export default function AppActionsTab({ appId }: AppActionsTabProps) {
  // Get app details from Redux
  const app = useAppSelector((state) => selectAppById(state, appId));
  const extraButtons = useAppSelector((state) => selectAppExtraButtons(state, appId)) || [];

  if (!app) {
    return <div>App not found</div>;
  }

  const getActionTypeIcon = (actionType?: string) => {
    switch (actionType) {
      case 'button':
        return <ArrowRight className="h-4 w-4 text-blue-500" />;
      case 'link':
        return <ExternalLink className="h-4 w-4 text-green-500" />;
      case 'redux':
        return <Code className="h-4 w-4 text-purple-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionTypeBadge = (actionType?: string) => {
    switch (actionType) {
      case 'button':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
            Button
          </Badge>
        );
      case 'link':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
            Link
          </Badge>
        );
      case 'redux':
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
            Redux Action
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800">
            Unknown
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">App Actions</h3>
        
        {extraButtons.length > 0 ? (
          <div className="space-y-4">
            {extraButtons.map((button: CustomActionButton, index: number) => (
              <div key={index} className="border-border rounded-md p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getActionTypeIcon(button.actionType)}
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{button.label}</h4>
                  </div>
                  {getActionTypeBadge(button.actionType)}
                </div>
                
                <div className="space-y-2 mt-3">
                  {button.actionType === 'link' && button.route && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Route</p>
                      <p className="text-gray-900 dark:text-gray-100">{button.route}</p>
                    </div>
                  )}
                  
                  {button.actionType === 'redux' && button.reduxAction && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Redux Action</p>
                      <p className="text-gray-900 dark:text-gray-100">{button.reduxAction}</p>
                    </div>
                  )}
                  
                  {button.knownMethod && button.knownMethod !== 'none' && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Method</p>
                      <p className="text-gray-900 dark:text-gray-100">{button.knownMethod}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-6 text-gray-500 dark:text-gray-400">
            <p>No custom actions configured for this app</p>
          </div>
        )}
      </Card>
    </div>
  );
} 