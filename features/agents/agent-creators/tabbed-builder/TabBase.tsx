'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import { tabMetadata } from './constants';

interface TabBaseProps {
  id: string;
  tabNumber: number;
  title?: string;
  description?: string;
  isEnabled: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  alwaysEnabled?: boolean;
  footer?: React.ReactNode;
}

// Define a common interface for content components
interface ContentComponentProps {
  updateContent?: (content: string) => void;
}

export const TabBase: React.FC<TabBaseProps> = ({
  id,
  tabNumber,
  title,
  description,
  isEnabled,
  onToggle,
  children,
  alwaysEnabled = false,
  footer,
}) => {
  const [localContent, setLocalContent] = useState<string>('');
  
  // Use metadata from constants if title/description not provided
  const metadata = id in tabMetadata ? tabMetadata[id as keyof typeof tabMetadata] : undefined;
  const tabTitle = title || (metadata?.title || id);
  const tabDescription = description || metadata?.description;
  const isAlwaysEnabled =
    alwaysEnabled || Boolean(metadata && 'alwaysEnabled' in metadata && metadata.alwaysEnabled);
  
  // This function allows child components to update their content - use useCallback to prevent infinite loops
  const updateContent = useCallback((content: string) => {
    setLocalContent(content);
  }, []);

  return (
    <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-gray-900 dark:text-gray-100 text-lg font-medium">{tabTitle}</CardTitle>
            {tabDescription && (
              <CardDescription className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                {tabDescription}
              </CardDescription>
            )}
          </div>
          {!isAlwaysEnabled && (
            <div className="flex items-center">
              <Label htmlFor={`enable-${id}`} className="text-gray-800 dark:text-gray-300 mr-2 text-sm font-medium">
                Enable
              </Label>
              <Switch
                id={`enable-${id}`}
                checked={isEnabled}
                onCheckedChange={() => onToggle(id)}
                className="data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500"
              />
            </div>
          )}
        </div>
      </CardHeader>
      
      {(isEnabled || isAlwaysEnabled) && (
        <CardContent className="pt-2 pb-4 border-t border-zinc-100 dark:border-zinc-800">
          {/* Use React.Children to clone and pass updateContent to direct function components only */}
          {React.Children.map(children, child => {
            // Only pass updateContent to React components, not DOM elements
            if (React.isValidElement(child) && typeof child.type === 'function') {
              return React.cloneElement(child, { updateContent } as ContentComponentProps);
            }
            return child;
          })}
        </CardContent>
      )}
      
      {footer && (isEnabled || isAlwaysEnabled) && (
        <CardFooter className="flex items-center justify-between px-6 py-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 text-xs text-gray-500 dark:text-gray-400">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}; 