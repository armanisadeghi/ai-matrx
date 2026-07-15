"use client";
import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import { useRouter, usePathname } from "next/navigation";
import {
  selectAppRuntimeConfig,
  selectAppRuntimeExtraButtons,
  selectAppRuntimeMainAppIcon,
  selectAppRuntimePrimaryColor,
  selectAppRuntimeAppletList,
  selectAppRuntimeAccentColor,
} from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { getAppIcon } from "@/features/applet/styles/StyledComponents";
import { CustomAppHeaderProps } from "../CustomAppHeader";
import {
  CustomActionButton,
  AppletListItemConfig,
  CustomAppConfig,
} from "@/types/customAppTypes";

export type AppLayoutOptions =
  | "tabbedApplets"
  | "singleDropdown"
  | "multiDropdown"
  | "singleDropdownWithSearch"
  | "icons";

export interface HeaderLogicProps extends CustomAppHeaderProps {
  children: (props: HeaderUIProps) => React.ReactNode;
  activeAppletSlug?: string;
  isPreview?: boolean;
}

export interface HeaderUIProps {
  activeAppIcon: React.ReactNode;
  appletList: AppletListItemConfig[];
  extraButtons: CustomActionButton[] | undefined;
  config: CustomAppConfig;
  primaryColor: string;
  displayName: string;
  profilePhoto: string | null;
  activeAppletSlug: string;
  handleAppletChange: (appletSlug: string) => void;
  isDemo: boolean;
  appId?: string;
  isPreview?: boolean;
}

export const HeaderLogic: React.FC<HeaderLogicProps> = ({
  appId,
  isDemo = false,
  isPreview = false,
  children,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const config = useAppSelector(selectAppRuntimeConfig);
  const extraButtons = useAppSelector(selectAppRuntimeExtraButtons);
  const iconName = useAppSelector(selectAppRuntimeMainAppIcon);
  const primaryColor = useAppSelector(selectAppRuntimePrimaryColor);
  const accentColor = useAppSelector(selectAppRuntimeAccentColor);
  const appletList = useAppSelector(selectAppRuntimeAppletList) || [];
  // Get active applet slug from the route instead of the selector
  const activeAppletSlug = (() => {
    if (!pathname || !config?.slug) return "";

    // Assuming route format: /apps/custom/{configSlug}/{appletSlug}
    const pathParts = pathname.split("/");
    const configSlugIndex = pathParts.findIndex((part) => part === config.slug);

    if (configSlugIndex !== -1 && pathParts.length > configSlugIndex + 1) {
      return pathParts[configSlugIndex + 1] ?? "";
    }

    return "";
  })();

  const user = useAppSelector(selectUser);
  const displayName =
    user.userMetadata.name ||
    user.userMetadata.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata.picture || null;

  // Generate the app icon using the existing function
  const activeAppIcon = getAppIcon({
    color: accentColor,
    icon: iconName,
    size: isPreview ? 18 : 24,
  });

  // Setup tab navigation function that uses routing instead of state
  const handleAppletChange = (appletSlug: string) => {
    // Skip navigation in preview mode
    if (isPreview) return;

    if (config?.slug && appletSlug) {
      router.push(`/apps/custom/${config.slug}/${appletSlug}`);
    }
  };

  if (!config || typeof primaryColor !== "string") {
    return null;
  }

  return children({
    activeAppIcon,
    appletList,
    extraButtons,
    config,
    primaryColor,
    displayName,
    profilePhoto,
    activeAppletSlug,
    handleAppletChange,
    isDemo,
    appId,
    isPreview,
  });
};

export default HeaderLogic;
