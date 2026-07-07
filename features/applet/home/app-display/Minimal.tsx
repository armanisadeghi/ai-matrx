'use client';
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { AppDisplayProps } from '@/features/applet/home/types';
import { InlineMediaRef } from '@/features/files';


const MinimalAppDisplay: React.FC<AppDisplayProps> = ({
  appName,
  appDescription,
  appIcon,
  appImageUrl,
  creator,
  accentColor,
  primaryColor,
}) => {
  return (
    <div className="max-w-7xl mx-auto mb-8 px-2">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        {/* App info section */}
        <div className="w-full sm:w-1/3">
          {/* App icon and name */}
          <div className="flex items-start gap-3">
            {appIcon && (
              <div className="flex-shrink-0">
                {getAppIconWithBg({
                  icon: appIcon,
                  size: 36,
                  color: accentColor || 'blue',
                  primaryColor: primaryColor || 'gray',
                  className: 'rounded-md bg-gray-100 dark:bg-gray-800 shadow-sm w-full h-full flex items-center justify-center'
                })}
              </div>
            )}
            
            <div className="flex flex-col justify-center">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {appName}
              </h1>
              {creator && (
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                  By {creator}
                </p>
              )}
            </div>
          </div>
          
          {/* Description - Full width on mobile */}
          {appDescription && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 sm:mt-3">
              {appDescription}
            </p>
          )}
        </div>
        
        {/* App image - Full width on mobile */}
        {appImageUrl && (
          <div className="w-full sm:w-2/3">
            <div className="w-full h-36 rounded-md overflow-hidden shadow-sm relative">
              {/* Durable, self-healing render — re-mints owned file URLs (KNOWN_DEFECTS.md D1). */}
              <InlineMediaRef
                ref={appImageUrl}
                size="fill"
                fit="cover"
                rounded="none"
                fallback={null}
                alt={`${appName} thumbnail`}
                className="absolute inset-0"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MinimalAppDisplay;