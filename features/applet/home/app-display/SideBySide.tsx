// QuarterThreeQuartersDisplay.tsx
"use client";
import React from "react";
import {
  getAppIconWithBg,
  getAppIcon,
  COLOR_VARIANTS,
} from "@/features/applet/styles/StyledComponents";
import { AppDisplayProps } from "@/features/applet/home/types";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";

const SideBySideAppDisplay: React.FC<AppDisplayProps> = ({
  appName,
  appDescription,
  appIcon,
  appImageUrl,
  creator,
  accentColor,
  primaryColor,
  isMobile,
}) => {
  return (
    <div className="max-w-7xl mx-auto mb-12">
      {/* Always side-by-side layout (no stacking) with 1/4 - 3/4 split */}
      <div className="flex flex-row items-start gap-6">
        {/* Left side: App information (1/4 width) */}
        <div className="w-1/4 min-w-0 pr-2">
          <div className="flex flex-col items-start gap-4">
            {/* Icon and Name side by side - aligned to top */}
            <div className="flex items-center gap-4 w-full">
              {/* App Icon - much bigger */}
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-textured shadow-md flex-shrink-0 flex items-center justify-center">
                {appIcon ? (
                  getAppIconWithBg({
                    icon: appIcon,
                    size: 48,
                    color: accentColor || "blue",
                    primaryColor: primaryColor || "gray",
                    className: "w-full h-full flex items-center justify-center",
                  })
                ) : (
                  <div className="text-4xl opacity-30 text-gray-400 dark:text-gray-600">
                    {appName?.charAt(0) || "A"}
                  </div>
                )}
              </div>

              {/* App Name - aligned to vertical center of icon */}
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
                {appName}
              </h1>
            </div>

            {/* Creator */}
            {creator && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Created by {creator}
              </p>
            )}

            {/* App Description */}
            {appDescription && (
              <div className="text-gray-600 dark:text-gray-300 w-full">
                <p className="break-words">{appDescription}</p>
              </div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs bg-${accentColor}-500 dark:bg-${accentColor}-600 border`}
              >
                App
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                Integration
              </span>
            </div>
          </div>
        </div>

        {/* Right side: App Image (3/4 width) - no vertical padding to align with icon */}
        <div className="w-3/4 px-4">
          {appImageUrl ? (
            <div className="rounded-xl overflow-hidden shadow-md aspect-video relative">
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
            </div>
          ) : (
            <div className="rounded-xl bg-gray-100 dark:bg-gray-800 aspect-video flex items-center justify-center">
              <span className="text-gray-400 dark:text-gray-600 text-lg">
                No preview available
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SideBySideAppDisplay;
