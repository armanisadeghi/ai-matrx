// ModernAppletCard.tsx
'use client';
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { AppletCardProps } from '@/features/applet/home/types';
import { InlineMediaRef } from '@/features/files';


const ModernAppletCard: React.FC<AppletCardProps> = ({
  applet,
  primaryColor,
  accentColor,
  onClick,
  isMobile
}) => {
  
  return (
    <div 
      className="group relative rounded-xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col border-border hover:border-gray-400 dark:hover:border-gray-500"
      onClick={onClick}
    >
      {/* Horizontal layout with icon on left side */}
      <div className="flex items-stretch">
        {/* Left sidebar with color and icon */}
        <div className={`w-16 flex-shrink-0 flex items-center justify-center bg-${primaryColor}-500 dark:bg-${primaryColor}-600`}>
          {applet.appletIcon ? (
            <div className="p-2 rounded-full bg-gray-100/20 backdrop-blur-sm">
              {getAppIcon({
                icon: applet.appletIcon,
                size: 28,
                color: accentColor,
                className: "text-gray-100"
              })}
            </div>
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-100/20 flex items-center justify-center">
              <span className="text-gray-100 font-bold">{applet.name?.charAt(0) || '?'}</span>
            </div>
          )}
        </div>
        
        {/* Right content area */}
        <div className="flex-grow p-4 bg-textured">
          {/* Card header with name and creator */}
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-gray-900 dark:text-white truncate max-w-[70%]">
              {applet.name}
            </h3>
            
            {applet.creator && (
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
                By {applet.creator}
              </span>
            )}
          </div>
          
          {/* Fixed height description area with consistent size */}
          <div className="h-16 overflow-hidden relative">
            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
              {applet.description || ''}
            </p>
          </div>
        </div>
      </div>
      
      {/* Preview image section */}
      <div className="h-32 w-full relative overflow-hidden bg-gray-100 dark:bg-gray-700">
        {applet.imageUrl ? (
          /* Durable, self-healing render — re-mints owned file URLs (FOUND_DEFECTS.md D1). */
          <InlineMediaRef
            ref={applet.imageUrl}
            size="fill"
            fit="cover"
            rounded="none"
            fallback={null}
            alt={`${applet.name} preview`}
            className="absolute inset-0 transform group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {/* Open button overlay on hover */}
        <div className="absolute bottom-0 right-0 m-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className={`bg-${accentColor}-500 dark:bg-${accentColor}-600 text-gray-100 px-4 py-1 text-sm rounded-full font-medium shadow-lg`}>
            Open
          </div>
        </div>
      </div>
      
      {/* Bottom stats bar */}
      <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-border flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className={`h-2 w-2 rounded-full bg-${primaryColor}-500 dark:bg-${primaryColor}-600`}></div>
          <span className="text-xs text-gray-500 dark:text-gray-400">Active</span>
        </div>
        
        <div className={`text-xs text-${accentColor}-500 dark:text-${accentColor}-600 font-medium`}>
          {applet.slug}
        </div>
      </div>
      
      {/* Subtle hover effect */}
      <div className="absolute inset-0 shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
    </div>
  );
};

export default ModernAppletCard;