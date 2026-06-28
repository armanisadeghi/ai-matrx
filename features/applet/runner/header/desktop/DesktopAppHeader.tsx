"use client";
import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppRuntimeLayoutType } from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { AppLayoutOptions } from "./HeaderLogic";
import { TabbedAppletsHeader } from "./TabbedAppletsHeader";
import { SingleDropdownHeader } from "./SingleDropdownHeader";
import { MultiDropdownHeader } from "./MultiDropdownHeader";
import { SingleDropdownWithSearchHeader } from "./SingleDropdownWithSearchHeader";
import { IconsHeader } from "./IconsHeader";

export interface DesktopAppHeaderProps {
  appId?: string;
  headerClassName?: string;
  isDemo?: boolean;
  isDebug?: boolean;
  activeAppletSlug?: string;
  isCreator?: boolean;
  isAdmin?: boolean;
  isPreview?: boolean;
  /** When true, render shell user menu in the applet header (e.g. fullscreen preview overlay). */
  showUserMenu?: boolean;
}

export const DesktopAppHeader: React.FC<DesktopAppHeaderProps> = (props) => {
  const layoutType = useAppSelector(
    selectAppRuntimeLayoutType,
  ) as AppLayoutOptions;

  switch (layoutType) {
    case "tabbedApplets":
      return <TabbedAppletsHeader {...props} />;
    case "singleDropdown":
      return <SingleDropdownHeader {...props} />;
    case "multiDropdown":
      return <MultiDropdownHeader {...props} />;
    case "singleDropdownWithSearch":
      return <SingleDropdownWithSearchHeader {...props} />;
    case "icons":
      return <IconsHeader {...props} />;
    default:
      return <TabbedAppletsHeader {...props} />;
  }
};

export default DesktopAppHeader;
