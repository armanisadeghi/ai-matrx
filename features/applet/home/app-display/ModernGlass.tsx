// ModernGlassAppDisplay.tsx
'use client';
import React from 'react';
import { getAppIconWithBg, getAppIcon, COLOR_VARIANTS, getColorClasses } from '@/features/applet/styles/StyledComponents';
import { AppDisplayProps } from '@/features/applet/home/types';
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import GlassContainer from '@/components/ui/GlassContainer';

const ModernGlassAppDisplay: React.FC<AppDisplayProps> = ({
  appName,
  appDescription,
  appIcon,
  appImageUrl,
  creator,
  accentColor,
  primaryColor,
  isMobile
}) => {
  const accentBorderColor = getColorClasses("accentBorder", accentColor || 'blue');
  const primaryBgColor = getColorClasses("background", primaryColor || 'gray');

  return (
    <div className="max-w-7xl mx-auto mb-12">
      <GlassContainer
        backgroundImage={appImageUrl}
        backgroundColor="bg-gray-900"
        enableHover={false}
        overlayDarkness={70}
      >


          <div className="flex flex-col md:flex-row">
            {/* Left column: App information */}
            <div className="md:w-3/5 p-6 md:p-8 flex flex-col relative z-10">
              <div className="flex items-center gap-4 mb-6">
                {/* App Icon */}
                <div className="w-14 h-14 rounded-lg overflow-hidden shadow-md flex-shrink-0 flex items-center justify-center bg-gray-100/20 backdrop-blur-sm border border-gray-100/30">
                  {appIcon ? (
                    getAppIcon({
                      icon: appIcon,
                      size: 28,
                      color: accentColor || 'blue',
                      className: 'text-gray-100'
                    })
                  ) : (
                    <div className="text-2xl text-gray-100 font-bold">
                      {appName?.charAt(0) || 'A'}
                    </div>
                  )}
                </div>
                
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-white">
                    {appName}
                  </h1>
                  {creator && (
                    <div className="flex items-center mt-1">
                      <span className="text-sm text-gray-200 opacity-80">
                        By {creator}
                      </span>
                      <div className="ml-3 flex items-center space-x-2">
                        <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
                        <span className="text-xs text-gray-100/80">Active</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* App Description */}
              {appDescription && (
                <div className="text-gray-100/80 mb-6 flex-grow">
                  <p>{appDescription}</p>
                </div>
              )}
              
              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 mt-auto pt-4 border-t border-gray-100/20">
                <button className="px-5 py-2 rounded-full bg-gray-100/20 backdrop-blur-sm text-gray-100 border border-gray-100/30 hover:bg-gray-100/30 font-medium transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:translate-y-[-2px]">
                  Open App
                </button>
                <button className="px-5 py-2 rounded-full bg-gray-900/40 backdrop-blur-sm text-gray-100/90 border border-gray-100/10 hover:bg-gray-900/50 hover:border-gray-100/20 font-medium transition-all duration-300">
                  View Details
                </button>
              </div>
            </div>
            
            {/* Right column: App Image */}
            {appImageUrl && (
              <div className="md:w-2/5 relative">
                <div className="h-full min-h-[240px] md:min-h-[320px] relative overflow-hidden">
                  {/* Decorative floating elements */}
                  <div className="absolute top-1/4 right-1/4 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
                  <div className="absolute bottom-1/3 right-1/3 w-16 h-16 bg-white/5 rounded-full blur-lg"></div>
                  
                  {/* App preview image with glass frame */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-xl overflow-hidden border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-sm">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                  </div>
                </div>
              </div>
            )}
        </div>
      </GlassContainer>
    </div>
  );
};

export default ModernGlassAppDisplay;