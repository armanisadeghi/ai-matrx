"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ThemeSwitcherIcon } from "@/styles/themes/ThemeSwitcher";
import AppSelector from "../common/AppSelector";
import ButtonMenu from "../common/ButtonMenu";
import ShellUserMenu from "@/features/shell/components/header/header-right-menu/ShellUserMenu";
import { HeaderLogic } from "./HeaderLogic";
import { DesktopAppHeaderProps } from "./DesktopAppHeader";
import { getAppIcon } from "@/features/applet/styles/StyledComponents";

export const IconsHeader: React.FC<DesktopAppHeaderProps> = ({
  appId,
  headerClassName,
  isDemo = false,
  activeAppletSlug,
  isCreator,
  isAdmin,
  isPreview,
  showUserMenu = false,
}) => {
  // Use the default header class if no custom className is provided
  const defaultHeaderClass =
    "sticky top-0 w-full z-40 h-14 bg-textured transition-colors shadow-sm";
  const finalHeaderClass = headerClassName || defaultHeaderClass;

  return (
    <HeaderLogic appId={appId} isDemo={isDemo} isPreview={isPreview}>
      {({
        activeAppIcon,
        appletList,
        extraButtons,
        config,
        displayName,
        profilePhoto,
        activeAppletSlug,
        handleAppletChange,
        isDemo: isDemoMode,
        isPreview: isPreviewMode,
      }) => (
        <header className={finalHeaderClass}>
          {/* Top Navigation with primary grid */}
          <div
            className={`grid grid-cols-12 items-center h-full ${isPreviewMode ? "px-2 py-1" : "pt-2 pb-2 px-6"}`}
          >
            {/* Left section - Icon and Applet Icon Grid (8/12) */}
            <div className="col-span-12 lg:col-span-8">
              {/* Nested grid for icon and icons */}
              <div className="flex items-center">
                <div className="shrink-0 mr-4">
                  <div>
                    {isPreviewMode ? (
                      <div>{activeAppIcon}</div>
                    ) : (
                      <Link href={`/apps/custom/${config.slug}`}>
                        {activeAppIcon}
                      </Link>
                    )}
                  </div>
                </div>
                {/* Icon Grid - with overflow handling */}
                <div className="overflow-x-auto hide-scrollbar">
                  <div className="flex space-x-3">
                    {appletList.map((applet) => {
                      const isActive = applet.slug === activeAppletSlug;
                      // Use the main accentColor for icons since appletList doesn't contain color/icon
                      const appletIcon = getAppIcon({
                        color: config.accentColor,
                        icon: "Layout", // Default icon if none available
                        size: isPreviewMode ? 18 : 24,
                      });

                      return (
                        <div
                          key={applet.slug}
                          onClick={() => handleAppletChange(applet.slug)}
                          className={`
                                                        flex flex-col items-center p-2 rounded-md cursor-pointer
                                                        ${
                                                          isActive
                                                            ? "bg-gray-100 dark:bg-gray-800"
                                                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                                                        }
                                                    `}
                        >
                          {appletIcon}
                          <span
                            className={`text-xs mt-1 ${isActive ? "font-medium" : ""}`}
                          >
                            {applet.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right section - Buttons and profile (4/12) */}
            <div className="col-span-12 lg:col-span-4 flex items-center justify-end gap-2 shrink-0 mt-2 lg:mt-0">
              {extraButtons && extraButtons.length > 0 && (
                <ButtonMenu buttons={extraButtons} />
              )}
              {(isDemoMode || !appId) && <AppSelector />}
              <ThemeSwitcherIcon className="hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200" />

              {showUserMenu && <ShellUserMenu />}
            </div>
          </div>
        </header>
      )}
    </HeaderLogic>
  );
};

export default IconsHeader;
