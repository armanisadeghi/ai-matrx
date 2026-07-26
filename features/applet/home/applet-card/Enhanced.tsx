// EnhancedAppletCard.tsx - Default card with glass effect
"use client";
import React from "react";
import { getAppIcon } from "@/features/applet/styles/StyledComponents";
import { AppletCardProps } from "@/features/applet/home/types";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import GlassContainer from "@/components/ui/GlassContainer";

const EnhancedAppletCard: React.FC<AppletCardProps> = ({
  applet,
  primaryColor,
  accentColor,
  onClick,
  isMobile,
}) => {
  return (
    <GlassContainer
      backgroundColor="bg-gray-200 dark:bg-gray-700"
      borderRadius="xl"
      glassOpacity={0}
      borderOpacity={30}
      blurIntensity={0}
      overlayDarkness={0}
      cornerHighlights={true}
      enableGlow={true}
      enableShimmer={true}
      enableHover={true}
      hoverScale={1.02}
      clickable={true}
      onClick={onClick}
      height="100%"
    >
      <div className="flex flex-col h-full rounded-xl overflow-hidden">
        {/* Card image/banner section - CRISP and CLEAR */}
        <div className="h-40 w-full bg-gray-200 dark:bg-gray-700 relative flex-shrink-0">
          {applet.imageUrl ? (
            /* Durable, self-healing render — re-mints owned file URLs (FOUND_DEFECTS.md D1). */
            <InlineMediaRef
              ref={applet.imageUrl}
              size="fill"
              fit="cover"
              rounded="none"
              fallback={null}
              alt={applet.name}
              className="absolute inset-0"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center bg-${primaryColor}-500 dark:bg-${primaryColor}-600`}
            >
              <div className="opacity-10 text-5xl">
                {applet.name?.charAt(0) || "?"}
              </div>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>

          {/* Applet icon and name on image */}
          <div className="absolute bottom-0 left-0 p-4 w-full flex items-center gap-3 z-10">
            {applet.appletIcon && (
              <div className="rounded-full bg-gray-100/20 backdrop-blur-sm p-1 flex-shrink-0 transition-all duration-300 group-hover:bg-gray-100/30 group-hover:shadow-lg">
                {getAppIcon({
                  icon: applet.appletIcon,
                  size: 24,
                  color: accentColor,
                  className: "text-gray-100",
                })}
              </div>
            )}
            <h3 className="text-white font-semibold text-lg truncate transition-all duration-300 group-hover:translate-x-1">
              {applet.name}
            </h3>
          </div>
        </div>

        {/* Card content section with GLASS EFFECT */}
        <div className="flex-1 p-4 backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 relative border-t border-gray-200/30 dark:border-gray-700/30 rounded-b-xl">
          <div className="h-[3.5rem] mb-4">
            {applet.description ? (
              <p className="text-gray-800 dark:text-gray-200 text-sm line-clamp-3">
                {applet.description}
              </p>
            ) : (
              <div className="h-full"></div>
            )}
          </div>

          <div className="flex items-center justify-between">
            {/* Optional creator badge */}
            {applet.creator && (
              <span className="text-xs text-gray-600 dark:text-gray-300">
                By {applet.creator}
              </span>
            )}

            {/* Access button with glass effect */}
            <div className="px-3 py-1 text-sm rounded-full bg-gray-100/40 dark:bg-gray-100/20 backdrop-blur-sm border border-gray-300/60 dark:border-gray-100/40 text-gray-800 dark:text-gray-200 font-medium transition-all duration-300 hover:bg-gray-100/60 hover:border-gray-300/80 dark:hover:bg-gray-100/30 dark:hover:border-gray-100/60 hover:shadow-lg hover:translate-y-[-2px]">
              Open
            </div>
          </div>
        </div>
      </div>
    </GlassContainer>
  );
};

export default EnhancedAppletCard;
