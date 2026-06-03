'use client';

import React from 'react';
import { CustomAppletConfig } from '@/types/customAppTypes';
import { CogIcon, LayersIcon, ImageIcon, SlidersIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ICON_OPTIONS } from '@/features/applet/styles/StyledComponents';
import { InlineMediaRef } from '@/features/files';

interface AppletPreviewCardProps {
  applet: CustomAppletConfig;
  className?: string;
  onClick?: () => void;
}

const AppletPreviewCard: React.FC<AppletPreviewCardProps> = ({ applet, className, onClick }) => {
  // Render the applet icon
  const renderAppletIcon = () => {
    if (!applet.appletIcon) return <CogIcon className="h-5 w-5" />;
    
    const IconComponent = ICON_OPTIONS[applet.appletIcon];
    if (!IconComponent) return <CogIcon className="h-5 w-5" />;
    
    return <IconComponent className="h-5 w-5" />;
  };

  // Generate color classes based on applet config
  const getPrimaryColorClass = (type: 'bg' | 'text' | 'border') => {
    const color = applet.primaryColor || 'emerald';
    if (type === 'bg') return `bg-${color}-100 dark:bg-${color}-900/30`;
    if (type === 'text') return `text-${color}-600 dark:text-${color}-400`;
    return `border-${color}-200 dark:border-${color}-800`;
  };

  const getAccentColorClass = (type: 'bg' | 'text' | 'border') => {
    const color = applet.accentColor || 'blue';
    if (type === 'bg') return `bg-${color}-500 dark:bg-${color}-600`;
    if (type === 'text') return `text-${color}-500 dark:text-${color}-400`;
    return `border-${color}-500 dark:border-${color}-600`;
  };

  // Count the number of containers and fields
  const containerCount = applet.containers?.length || 0;
  const fieldCount = applet.containers?.reduce((count, container) => 
    count + (container.fields?.length || 0), 0) || 0;

  return (
    <div className={cn("w-full", className)}>
      <Card 
        className={`border-border overflow-hidden ${
          onClick ? 'cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-all' : ''
        }`}
        onClick={onClick}
      >
        {/* Applet Banner Image */}
        {(applet.imageFileId || applet.imageUrl) ? (
          <div className="w-full h-28 relative">
            <InlineMediaRef
              ref={applet.imageFileId ? { file_id: applet.imageFileId } : applet.imageUrl}
              size="fill"
              fit="cover"
              rounded="none"
              fallback={null}
              alt={applet.name}
            />
          </div>
        ) : (
          <div className={`w-full h-28 flex items-center justify-center ${getPrimaryColorClass('bg')} ${getPrimaryColorClass('border')} border-b`}>
            <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
              <ImageIcon className="h-8 w-8 mb-1" />
              <span className="text-xs">Applet Image</span>
            </div>
          </div>
        )}

        <CardHeader className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              {/* Applet Icon */}
              <div className={`p-1.5 rounded-md ${getAccentColorClass('bg')} text-white`}>
                {renderAppletIcon()}
              </div>
              
              <CardTitle className="text-base font-medium text-gray-900 dark:text-gray-100">
                {applet.name}
              </CardTitle>
            </div>
            
            {/* Layout Type Badge */}
            <Badge variant="outline" className="text-xs">
              {applet.layoutType || 'Flat'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-3 pt-0">
          <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-3">
            {applet.description || 'No description provided for this applet.'}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className={`p-1.5 rounded-md ${getPrimaryColorClass('bg')} ${getPrimaryColorClass('border')} border`}>
              <div className="flex items-center space-x-1.5">
                <LayersIcon className={`h-3 w-3 ${getPrimaryColorClass('text')}`} />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {containerCount} Containers
                </span>
              </div>
            </div>
            
            <div className={`p-1.5 rounded-md ${getPrimaryColorClass('bg')} ${getPrimaryColorClass('border')} border`}>
              <div className="flex items-center space-x-1.5">
                <SlidersIcon className={`h-3 w-3 ${getPrimaryColorClass('text')}`} />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {fieldCount} Fields
                </span>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="p-3 border-t border-border bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Created by {applet.creator || 'Unknown'}
            </span>
            
            {applet.compiledRecipeId && (
              <Badge className={`${getAccentColorClass('bg')} text-white text-xs`}>
                Recipe Ready
              </Badge>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AppletPreviewCard; 