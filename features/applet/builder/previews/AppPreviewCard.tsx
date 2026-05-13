'use client';
import React from 'react';
import { CalendarIcon, CogIcon, UsersIcon, StarIcon, ImageIcon, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ICON_OPTIONS, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { InlineMediaRef } from '@/features/files';
import { useAppSelector } from "@/lib/redux/hooks";
import { 
  selectAppName,
  selectAppDescription,
  selectAppSlug,
  selectAppMainAppIcon,
  selectAppCreator,
  selectAppPrimaryColor,
  selectAppAccentColor,
  selectAppLayoutType,
  selectAppImageUrl,
  selectAppAppletList,
} from '@/lib/redux/app-builder/selectors/appSelectors';

interface AppPreviewCardProps {
  appId: string;
  className?: string;
}

const AppPreviewCard: React.FC<AppPreviewCardProps> = ({ appId, className }) => {
  // Use Redux selectors to get app data directly
  const name = useAppSelector(state => selectAppName(state, appId)) || '';
  const description = useAppSelector(state => selectAppDescription(state, appId)) || '';
  const slug = useAppSelector(state => selectAppSlug(state, appId)) || '';
  const mainAppIcon = useAppSelector(state => selectAppMainAppIcon(state, appId)) || '';
  const creator = useAppSelector(state => selectAppCreator(state, appId)) || 'Unknown';
  const primaryColor = useAppSelector(state => selectAppPrimaryColor(state, appId)) || 'gray';
  const accentColor = useAppSelector(state => selectAppAccentColor(state, appId)) || 'rose';
  const layoutType = useAppSelector(state => selectAppLayoutType(state, appId)) || 'Standard';
  const imageUrl = useAppSelector(state => selectAppImageUrl(state, appId)) || '';
  const appletList = useAppSelector(state => selectAppAppletList(state, appId)) || [];

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Render the app icon
  const renderAppIcon = () => {
    if (!mainAppIcon) return <CogIcon className="h-5 w-5" />;
    
    const IconComponent = ICON_OPTIONS[mainAppIcon];
    if (!IconComponent) return <CogIcon className="h-5 w-5" />;
    
    return <IconComponent className="h-5 w-5" />;
  };

  // Get color classes using exact variants
  const primaryBgClass = COLOR_VARIANTS.primaryBg[primaryColor];
  const primaryTextClass = COLOR_VARIANTS.primaryText[primaryColor];
  const primaryBorderClass = COLOR_VARIANTS.primaryBorder[primaryColor];
  
  const accentBgClass = COLOR_VARIANTS.accentBg[accentColor];
  const accentTextClass = COLOR_VARIANTS.accentText[accentColor];
  const accentBorderClass = COLOR_VARIANTS.accentBorder[accentColor];

  return (
    <div className={cn("w-full", className)}>
      <Card className="border-border overflow-hidden">
        {/* App Banner Image */}
        {imageUrl ? (
          <div className="w-full h-36 relative">
            <InlineMediaRef
              ref={imageUrl}
              size="fill"
              fit="cover"
              rounded="none"
              fallback={null}
              alt={name || 'App Banner'}
            />
          </div>
        ) : (
          <div className="w-full h-36 flex items-center justify-center bg-gray-100 dark:bg-gray-900 border-b border-border">
            <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
              <ImageIcon className={`h-10 w-10 mb-2 ${accentTextClass} ${accentBorderClass}`} />
              <span className="text-sm">App Banner Image</span>
            </div>
          </div>
        )}
        
        {/* Apply primary background color to header section */}
        <CardHeader className={`p-4 ${primaryBgClass}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              {/* App Icon with accent color */}
              <div className={`p-2 rounded-md ${accentBgClass} text-white`}>
                {renderAppIcon()}
              </div>
              
              <div>
                <CardTitle className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {name || 'App Name'}
                </CardTitle>
                <CardDescription className="text-sm text-gray-500 dark:text-gray-400">
                  {slug ? `matrx.com/apps/${slug}` : 'matrx.com/apps/your-slug'}
                </CardDescription>
              </div>
            </div>
            {/* Creator Avatar - using User icon instead of initials */}
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gray-200 dark:bg-gray-700">
                <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              </AvatarFallback>
            </Avatar>
          </div>
        </CardHeader>
        
        {/* Apply primary background color to content section */}
        <CardContent className={`p-4 pt-0 ${primaryBgClass}`}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-3">
            {description || 'App description will appear here.'}
          </p>
          
          {/* App Features/Statistics */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className={`p-2 rounded-md bg-textured ${primaryBorderClass} border`}>
              <div className="flex items-center space-x-2">
                <UsersIcon className={`h-4 w-4 ${primaryTextClass}`} />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {appletList.length} Applets
                </span>
              </div>
            </div>
            
            <div className={`p-2 rounded-md bg-textured ${primaryBorderClass} border`}>
              <div className="flex items-center space-x-2">
                <StarIcon className={`h-4 w-4 ${primaryTextClass}`} />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="capitalize">{layoutType}</span> Layout
                </span>
              </div>
            </div>
          </div>
        </CardContent>
        
        {/* Apply primary background color to footer section */}
        <CardFooter className={`p-4 border-t border-border ${primaryBgClass}`}>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-2">
              <CalendarIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Created by {creator}
              </span>
            </div>
            
            <Badge variant="outline" className={`${accentTextClass} ${accentBorderClass} bg-transparent`}>
              Styled Preview
            </Badge>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AppPreviewCard;