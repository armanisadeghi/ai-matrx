// components/AppletHeader/MobileAppHeader.tsx
"use client";
import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import { ThemeSwitcherIcon } from "@/styles/themes/ThemeSwitcher";
import Image from "next/image";
import Link from "next/link";
import MobileTabHeader from "./MobileTabHeader ";
import AppSelector from "../common/AppSelector";
import ButtonMenu from "../common/ButtonMenu";
import { useRouter } from "next/navigation";
import {
  selectAppRuntimeConfig,
  selectAppRuntimeExtraButtons,
  selectAppRuntimeMainAppIcon,
  selectAppRuntimeAppletList,
} from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { getAppIcon } from "@/features/applet/styles/StyledComponents";

interface MobileAppHeaderProps {
  appId?: string;
  headerClassName?: string;
  isDemo?: boolean;
  isDebug?: boolean;
  activeAppletSlug?: string;
  isCreator?: boolean;
  isAdmin?: boolean;
  isPreview?: boolean;
}

export const MobileAppHeader = ({
  appId,
  activeAppletSlug,
  isDemo = false,
  isCreator,
  isAdmin,
  isPreview = false,
}: MobileAppHeaderProps) => {
  const router = useRouter();
  const user = useAppSelector(selectUser);
  const displayName =
    user.userMetadata.name ||
    user.userMetadata.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata.picture || null;

  const config = useAppSelector(selectAppRuntimeConfig);
  const extraButtons = useAppSelector(selectAppRuntimeExtraButtons);
  const iconName = useAppSelector(selectAppRuntimeMainAppIcon);
  const appletList = useAppSelector(selectAppRuntimeAppletList) || [];

  // Generate the app icon using the existing function
  const activeAppIcon = React.useMemo(() => {
    return getAppIcon({
      color: config?.accentColor,
      icon: iconName,
      size: isPreview ? 18 : 24,
    });
  }, [config?.accentColor, iconName, isPreview]);

  // Setup tab navigation function that uses routing instead of state
  const handleTabChange = (tabSlug: string) => {
    if (config?.slug && tabSlug) {
      router.push(`/apps/custom/${config.slug}/${tabSlug}`);
    }
  };

  if (!config) {
    return null;
  }

  return (
    <div className="w-full h-full bg-textured transition-colors">
      <div
        className={`flex items-center justify-between ${isPreview ? "p-1" : "p-2"}`}
      >
        {/* Left section - App icon */}
        <div className="shrink-0">
          <Link href={`/apps/custom/${config.slug}`}>{activeAppIcon}</Link>
        </div>

        {/* Center section - Mobile Tab Header */}
        <div className="flex-1 mx-2">
          <MobileTabHeader
            config={appletList.map((app) => ({
              value: app.slug,
              label: app.label,
            }))}
            activeTab={activeAppletSlug || ""}
            setActiveTab={handleTabChange}
          />
        </div>

        {/* Right section - Theme switcher and profile */}
        <div className="flex items-center gap-1 shrink-0">
          {extraButtons && extraButtons.length > 0 && !isPreview && (
            <ButtonMenu buttons={extraButtons} />
          )}
          {(isDemo || !appId) && !isPreview && <AppSelector />}
          <ThemeSwitcherIcon
            className={`text-gray-800 dark:text-gray-200 ${isPreview ? "w-4 h-4" : ""}`}
          />
          {!isPreview && (
            <div className="relative w-8 h-8 rounded-full overflow-hidden border-border">
              {profilePhoto ? (
                <Image
                  src={profilePhoto}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              ) : (
                <div className="w-full h-full bg-gray-500 dark:bg-gray-600 rounded-full"></div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileAppHeader;
