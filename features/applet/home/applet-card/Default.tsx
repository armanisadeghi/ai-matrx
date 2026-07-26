// AppletCard.tsx
"use client";
import React from "react";
import {
  getAppIconWithBg,
  getAppIcon,
  COLOR_VARIANTS,
} from "@/features/applet/styles/StyledComponents";
import { AppletCardProps } from "@/features/applet/home/types";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";

const AppletCard: React.FC<AppletCardProps> = ({
  applet,
  primaryColor,
  accentColor,
  onClick,
  isMobile,
}) => {
  return (
    <div
      className="group relative rounded-xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl transform hover:-translate-y-1 cursor-pointer border-border"
      onClick={onClick}
    >
      {/* Card image/banner */}
      <div className="h-40 w-full bg-gray-200 dark:bg-gray-700 relative">
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
        <div className="absolute bottom-0 left-0 p-4 w-full flex items-center gap-3">
          {applet.appletIcon && (
            <div className="rounded-full bg-gray-100/20 backdrop-blur-sm p-1 flex-shrink-0">
              {getAppIcon({
                icon: applet.appletIcon,
                size: 24,
                color: accentColor,
                className: "text-gray-100",
              })}
            </div>
          )}
          <h3 className="text-white font-semibold text-lg truncate">
            {applet.name}
          </h3>
        </div>
      </div>

      {/* Card content */}
      <div className="p-4 bg-textured">
        <div className="h-[3.5rem] mb-4">
          {applet.description ? (
            <p className="text-gray-600 dark:text-gray-300 text-sm line-clamp-3">
              {applet.description}
            </p>
          ) : (
            <div className="h-full"></div>
          )}
        </div>

        <div className="flex items-center justify-between">
          {/* Optional creator badge */}
          {applet.creator && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              By {applet.creator}
            </span>
          )}

          {/* Access button with applet accent color */}
          <div
            className={`px-3 py-1 text-sm rounded-full border bg-${accentColor}-500 dark:bg-${accentColor}-600 font-medium transition-colors`}
          >
            Open
          </div>
        </div>
      </div>

      {/* Hover overlay effect */}
      <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
    </div>
  );
};

export default AppletCard;
