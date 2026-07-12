// ModernAppDisplay.tsx
'use client';
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { AppDisplayProps } from '@/features/applet/home/types';
import { InlineMediaRef } from '@/features/files';

const ModernAppDisplay: React.FC<AppDisplayProps> = ({
  appName,
  appDescription,
  appIcon,
  appImageUrl,
  creator,
  accentColor,
  primaryColor,
  isMobile
}) => {
  return (
    <div className="max-w-7xl mx-auto mb-12">
      <div className="bg-textured rounded-2xl shadow-sm border-border overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Left column: App information */}
          <div className="md:w-3/5 p-6 md:p-8 flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              {/* App Icon */}
              <div className="w-14 h-14 rounded-lg overflow-hidden shadow-md flex-shrink-0 flex items-center justify-center">
                {appIcon ? (
                  getAppIconWithBg({
                    icon: appIcon,
                    size: 28,
                    color: accentColor,
                    primaryColor: primaryColor,
                    className: 'w-full h-full flex items-center justify-center'
                  })
                ) : (
                  <div className="text-2xl opacity-30 text-gray-400 dark:text-gray-600">
                    {appName?.charAt(0) || 'A'}
                  </div>
                )}
              </div>
              
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {appName}
                </h1>
                {creator && (
                  <div className="flex items-center mt-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      By {creator}
                    </span>
                    <span className={`ml-3 w-2 h-2 rounded-full bg-${accentColor}-500 dark:bg-${accentColor}-600`}></span>
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">Active</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* App Description */}
            {appDescription && (
              <div className="text-gray-600 dark:text-gray-300 mb-6 flex-grow">
                <p>{appDescription}</p>
              </div>
            )}
            
            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
              <button className={`px-4 py-2 rounded-lg bg-${accentColor}-500 dark:bg-${accentColor}-600 text-white hover:bg-opacity-90 dark:hover:bg-opacity-80 font-medium transition-colors`}>
                Open App
              </button>
              <button className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors">
                View Details
              </button>
            </div>
          </div>
          
          {/* Right column: App Image */}
          {appImageUrl && (
            <div className="md:w-2/5 relative">
              <div className="h-full">
                {/* Durable, self-healing render — re-mints owned file URLs (FOUND_DEFECTS.md D1). */}
                <InlineMediaRef
                  ref={appImageUrl}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallback={null}
                  alt={`${appName} preview`}
                  className="absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-white dark:from-gray-800 md:via-transparent to-transparent opacity-30 md:opacity-0"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModernAppDisplay;