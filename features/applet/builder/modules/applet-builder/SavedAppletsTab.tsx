'use client';

import React from 'react';
import { PlusIcon, BoxIcon } from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  CardFooter 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CustomAppletConfig } from '@/types/customAppTypes';
import { COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';

interface SavedAppletsTabProps {
  savedApplets: CustomAppletConfig[];
  isLoading: boolean;
  setActiveTab: (tab: string) => void;
  editApplet: (applet: CustomAppletConfig) => void;
  deleteApplet: (id: string) => Promise<void>;
  renderIcon: (iconName: string | undefined) => React.ReactNode;
}

export const SavedAppletsTab: React.FC<SavedAppletsTabProps> = ({
  savedApplets,
  isLoading,
  setActiveTab,
  editApplet,
  deleteApplet,
  renderIcon
}) => {
  // Memoize color class for saved applet cards
  const getColorClass = (color: string) => {
    const textColors: Record<string, string> = COLOR_VARIANTS.text;
    return textColors[color] ?? COLOR_VARIANTS.text.emerald;
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">Loading applets...</p>
      </div>
    );
  }

  if (savedApplets.length === 0) {
    return (
      <div className="text-center py-8">
        <BoxIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">No applets</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Get started by creating a new applet
        </p>
        <div className="mt-6">
          <Button
            onClick={() => setActiveTab('create')}
            className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            New Applet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {savedApplets.map(applet => (
        <Card key={applet.id} className="border-border bg-textured">
          <CardHeader className="pb-2">
            <div className="flex items-center space-x-2">
              {renderIcon(applet.appletIcon)}
              <CardTitle className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {applet.name}
              </CardTitle>
            </div>
            <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
              {applet.slug}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {applet.description && (
                <p className="mb-2 truncate">{applet.description}</p>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                <p><span className="font-medium">Layout:</span> {applet.layoutType || 'Default'}</p>
                <p><span className="font-medium">Created By:</span> {applet.creator || 'Unknown'}</p>
                <p>
                  <span className="font-medium">Primary:</span> 
                  <span className={`inline-block w-3 h-3 rounded-full bg-${applet.primaryColor}-500 ml-1`}></span>
                  <span className="capitalize ml-1">{applet.primaryColor}</span>
                </p>
                <p>
                  <span className="font-medium">Accent:</span> 
                  <span className={`inline-block w-3 h-3 rounded-full bg-${applet.accentColor}-500 ml-1`}></span>
                  <span className="capitalize ml-1">{applet.accentColor}</span>
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between pt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteApplet(applet.id)}
              disabled={isLoading}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editApplet(applet)}
              disabled={isLoading}
              className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            >
              Edit
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

export default SavedAppletsTab;
