"use client";
import React from "react";
import { Menu, ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcherIcon } from "@/styles/themes/ThemeSwitcher";
import AppSelector from "../common/AppSelector";
import ButtonMenu from "../common/ButtonMenu";
import ShellUserMenu from "@/features/shell/components/header/header-right-menu/ShellUserMenu";
import { DesktopAppHeaderProps } from "./DesktopAppHeader";
import { HeaderLogic } from "./HeaderLogic";

export const MultiDropdownHeader: React.FC<DesktopAppHeaderProps> = ({
  appId,
  headerClassName,
  isDemo = false,
  activeAppletSlug = "",
  isCreator,
  isAdmin,
  isPreview,
  showUserMenu = false,
}) => {
  const defaultHeaderClass =
    "sticky top-0 w-full z-40 h-14 bg-textured transition-colors shadow-sm";
  const finalHeaderClass = headerClassName || defaultHeaderClass;

  return (
    <HeaderLogic
      appId={appId}
      isDemo={isDemo}
      activeAppletSlug={activeAppletSlug}
      isPreview={isPreview}
    >
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
      }) => {
        // Group applets by category (simplified example)
        const groupedApplets = {
          Main: appletList.slice(0, Math.ceil(appletList.length / 2)),
          Other: appletList.slice(Math.ceil(appletList.length / 2)),
        };

        // Find the active applet from the list
        const activeApplet = appletList.find(
          (applet) => applet.slug === activeAppletSlug,
        );

        return (
          <header className={finalHeaderClass}>
            <div
              className={`grid grid-cols-12 items-center h-full ${isPreviewMode ? "px-2 py-1" : "pt-2 pb-2 px-6"}`}
            >
              {/* Left section - Icon and Dropdown selector (8/12) */}
              <div className="col-span-12 lg:col-span-8">
                <div className="flex items-center">
                  <div className="shrink-0 mr-4">
                    {isPreviewMode ? (
                      <div>{activeAppIcon}</div>
                    ) : (
                      <Link href={`/apps/custom/${config.slug}`}>
                        {activeAppIcon}
                      </Link>
                    )}
                  </div>
                  <div className="relative inline-block">
                    <button
                      className={`flex items-center ${isPreviewMode ? "px-2 py-1 text-sm" : "px-4 py-2"} bg-textured rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
                    >
                      <span className="mr-2">
                        {activeApplet?.label || "Select Applet"}
                      </span>
                      <ChevronDown size={isPreviewMode ? 14 : 16} />
                    </button>
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
        );
      }}
    </HeaderLogic>
  );
};

export default MultiDropdownHeader;
