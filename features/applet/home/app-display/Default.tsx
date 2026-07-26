// AppDisplay.tsx
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { AppDisplayProps } from '@/features/applet/home/types';
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";

const AppDisplay: React.FC<AppDisplayProps> = ({
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
    <div 
      className="max-w-7xl mx-auto mb-12 border-2 border-red-500"
    >
      <div 
        className="flex flex-col md:flex-row items-start md:items-center gap-6 border-2 border-blue-500"
      >
        {/* App Icon - Small square container */}
        <div 
          className="w-24 h-24 rounded-xl overflow-hidden bg-textured shadow-md flex-shrink-0 flex items-center justify-center border-2 border-green-500"
        >
          {appIcon ? (
            getAppIconWithBg({
              icon: appIcon,
              size: 40,
              color: accentColor || 'blue',
              primaryColor: primaryColor || 'gray',
              className: 'w-full h-full flex items-center justify-center border-2 border-yellow-500'
            })
          ) : (
            <div 
              className="text-4xl opacity-30 text-gray-400 dark:text-gray-600 border-2 border-yellow-500"
            >
              {appName?.charAt(0) || 'A'}
            </div>
          )}
        </div>
        
        <div 
          className="border-2 border-purple-500"
        >
          <h1 
            className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white border-2 border-pink-500"
          >
            {appName}
          </h1>
          {creator && (
            <p 
              className="text-sm text-gray-500 dark:text-gray-400 mt-1 border-2 border-indigo-500"
            >
              Created by {creator}
            </p>
          )}
          {appDescription && (
            <p 
              className="text-gray-600 dark:text-gray-300 mt-4 max-w-3xl border-2 border-orange-500"
            >
              {appDescription}
            </p>
          )}
        </div>
      </div>
      
      {/* App Banner Image - Optional landscape banner */}
      {appImageUrl && (
        <div 
          className="mt-8 w-full rounded-xl overflow-hidden shadow-lg aspect-[21/9] relative border-2 border-teal-500"
        >
          {/* Durable, self-healing render — re-mints owned file URLs (FOUND_DEFECTS.md D1). */}
          <InlineMediaRef
            ref={appImageUrl}
            size="fill"
            fit="cover"
            rounded="none"
            fallback={null}
            alt={`${appName} banner`}
            className="absolute inset-0 border-2 border-cyan-500"
          />
        </div>
      )}
    </div>
  );
};

export default AppDisplay;