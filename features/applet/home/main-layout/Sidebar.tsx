'use client';
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { MainLayoutProps } from '@/features/applet/home/types';
import Image from 'next/image';
import { LoadingSpinner } from '@/components/ui/spinner';
import AppDisplay from '@/features/applet/home/app-display/Default';
import ModernAppletCard from '@/features/applet/home/applet-card/Modern';
import { InlineMediaRef } from '@/features/files';

const SidebarMainLayout: React.FC<MainLayoutProps> = ({
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
    <div className="h-full w-full overflow-hidden flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-border h-full flex flex-col bg-gray-50 dark:bg-gray-800">
        {/* App Info */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            {appIcon && (
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white dark:bg-gray-700 shadow-sm flex-shrink-0">
                {getAppIconWithBg({
                  icon: appIcon,
                  size: 24,
                  color: accentColor,
                  primaryColor: primaryColor,
                  className: 'flex items-center justify-center w-full h-full'
                })}
              </div>
            )}
            
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
                {appName}
              </h1>
              {creator && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">
                  By {creator}
                </p>
              )}
            </div>
          </div>
          
          {appDescription && (
            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3">
              {appDescription}
            </p>
          )}
        </div>
        
        {/* Applet List */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs uppercase font-medium text-gray-500 dark:text-gray-400 px-2 py-2 flex items-center">
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Applets ({appletList.length})
          </div>
          
          <div className="space-y-1 mt-1">
            {appletList.map((item) => {
              const applet = appletsMap[item.appletId];
              if (!applet) return null;
              
              const appletAccentColor = applet.accentColor || accentColor;
              const activeClass = `bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100`;
              const hoverClass = `hover:bg-gray-100 dark:hover:bg-gray-750`;
              
              return (
                <div
                  key={applet.id}
                  onClick={() => navigateToApplet(applet.slug)}
                  className={`rounded flex items-center px-2 py-2 text-sm cursor-pointer ${hoverClass} text-gray-800 dark:text-gray-200 group transition-colors`}
                >
                  {/* Applet icon */}
                  <div className="mr-2 w-6 h-6 flex items-center justify-center">
                    {applet.appletIcon ? (
                      getAppIcon({
                        icon: applet.appletIcon,
                        size: 18,
                        color: appletAccentColor,
                      })
                    ) : (
                      <span className="w-5 h-5 rounded-sm flex items-center justify-center text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {applet.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                  
                  {/* Applet name */}
                  <span className="truncate flex-grow">{applet.name}</span>
                  
                  {/* Hover indicator */}
                  <svg className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              );
            })}
            
            {appletList.length === 0 && (
              <div className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                No applets available
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 h-full overflow-auto p-6 bg-textured">
        {/* Banner Image */}
        {appImageUrl && (
          <div className="w-full aspect-[21/9] rounded-lg overflow-hidden mb-6 shadow-sm">
            <InlineMediaRef
              ref={appImageUrl}
              size="fill"
              fit="cover"
              rounded="none"
              fallback={null}
              alt={`${appName} banner`}
            />
          </div>
        )}
        
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Applet Details
          </h2>
          
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border-border">
            <p className="text-gray-600 dark:text-gray-300">
              Select an applet from the sidebar to view its details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SidebarMainLayout; 