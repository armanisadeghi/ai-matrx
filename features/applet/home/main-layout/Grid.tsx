'use client';
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { MainLayoutProps } from '@/features/applet/home/types';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/ui/spinner';
import AppDisplay from '@/features/applet/home/app-display/Default';
import ModernAppletCard from '@/features/applet/home/applet-card/Modern';
import { InlineMediaRef } from '@/features/files';


const GridMainLayout: React.FC<MainLayoutProps> = ({
  isInitialized,
  appName,
  appDescription,
  appIcon,
  appImageUrl,
  creator,
  primaryColor,
  accentColor,
  appletList,
  appletsMap,
  navigateToApplet,
  isMobile
}) => {
  if (!isInitialized) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }


  return (
    <div className="h-full w-full overflow-auto p-4 md:p-6">
      {/* Compact App Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border-border">
        <div className="flex items-center gap-3">
          {appIcon && (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-gray-700 shadow-sm flex-shrink-0">
              {getAppIconWithBg({
                icon: appIcon,
                size: 28,
                color: accentColor,
                primaryColor: primaryColor,
                className: 'flex items-center justify-center w-full h-full'
              })}
            </div>
          )}
          
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {appName}
            </h1>
            {creator && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                By {creator}
              </p>
            )}
          </div>
        </div>
        
        {/* Optional description */}
        {appDescription && (
          <p className="text-sm text-gray-600 dark:text-gray-300 md:max-w-md">
            {appDescription}
          </p>
        )}
      </div>
      
      {/* Card Grid - extra large grid with smaller cards */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Available Applets ({appletList.length})
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {appletList.map((item) => {
            const applet = appletsMap[item.appletId];
            if (!applet) return null;
            
            // This is simplified for the grid layout
            return (
              <div 
                key={applet.id}
                onClick={() => navigateToApplet(applet.slug)}
                className="group relative overflow-hidden rounded-lg border-border bg-textured shadow-sm hover:shadow transition-all duration-200 cursor-pointer flex flex-col h-48"
              >
                {/* Card image/banner top section */}
                <div className="h-20 bg-gray-100 dark:bg-gray-700 relative">
                  {applet.imageUrl ? (
                    <InlineMediaRef
                      ref={applet.imageUrl}
                      size="fill"
                      fit="cover"
                      rounded="none"
                      fallback={null}
                      alt={applet.name}
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center bg-${accentColor}-500 dark:bg-${accentColor}-600`}>
                      {applet.appletIcon && getAppIcon({
                        icon: applet.appletIcon,
                        size: 28,
                        color: applet.accentColor,
                        className: 'opacity-20'
                      })}
                    </div>
                  )}
                  
                  {/* Icon overlay */}
                  <div className="absolute -bottom-4 left-3 w-8 h-8 rounded-md bg-textured shadow-sm flex items-center justify-center border-border">
                    {applet.appletIcon ? (
                      getAppIcon({
                        icon: applet.appletIcon,
                        size: 18,
                        color: applet.accentColor || accentColor || 'blue',
                      })
                    ) : (
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {applet.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Card content */}
                <div className="p-3 pt-5 flex-grow flex flex-col">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                    {applet.name}
                  </h3>
                  
                  {applet.description && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-grow">
                      {applet.description}
                    </p>
                  )}
                  
                  {/* Bottom section with creator and action */}
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    {applet.creator && (
                      <span className="text-xs text-gray-500 dark:text-gray-500 truncate">
                        {applet.creator}
                      </span>
                    )}
                    
                    <div className={`ml-auto text-xs text-${accentColor}-500 dark:text-${accentColor}-600 font-medium group-hover:underline`}>
                      Open
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {appletList.length === 0 && (
          <div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-lg border-border">
            <svg className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg text-gray-800 dark:text-gray-200 mb-1">No applets available</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">This app doesn't have any applets configured yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridMainLayout; 