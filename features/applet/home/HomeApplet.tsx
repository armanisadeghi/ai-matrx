"use client";
import React from "react";
import type { AppDisplayVariant } from "./app-display/appDisplayVariants";
import type { AppletCardVariant } from "./applet-card/appletCardVariants";
import type { MainLayoutVariant } from "./main-layout/mainLayoutVariants";
import AppletCardAdapter from "./AppletCardAdapter";
import AppDisplayAdapter from "./AppDisplayAdapter";
import MainLayoutAdapter from "./MainLayoutAdapter";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppRuntimeAppletList,
  selectAppRuntimeMainAppIcon,
  selectAppRuntimeName,
  selectAppRuntimeDescription,
  selectAppRuntimeCreator,
  selectAppRuntimeCoreBackgroundColor,
  selectAppRuntimeAccentColor,
  selectAppRuntimeIsInitialized,
  selectAppRuntimeImageUrl,
} from "@/lib/redux/app-runner/slices/customAppRuntimeSlice";
import { selectAppletRuntimeApplets } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";
import { useIsMobile } from "@/hooks/use-mobile";
import ColorDivs from "./color-divs/ColorDivs";
import { LoadingSpinner } from "@/components/ui/spinner";
import type { CustomAppletConfig } from "@/types/customAppTypes";

export interface HomeAppletProps {
  navigateToApplet: (appletSlug: string) => void;
  appDisplayVariant?: AppDisplayVariant;
  appletCardVariant?: AppletCardVariant;
  mainLayoutVariant?: MainLayoutVariant;
  showColorDivs?: boolean;
}

export const HomeApplet: React.FC<HomeAppletProps> = ({
  navigateToApplet,
  appDisplayVariant = "default",
  appletCardVariant = "default",
  mainLayoutVariant = "default",
  showColorDivs = false,
}) => {
  // Get values from Redux store
  const storeIsInitialized = useAppSelector(selectAppRuntimeIsInitialized);
  const storeAppName = useAppSelector(selectAppRuntimeName);
  const storeAppDescription = useAppSelector(selectAppRuntimeDescription);
  const storeAppletList = useAppSelector(selectAppRuntimeAppletList) || [];
  const storeAppIcon = useAppSelector(selectAppRuntimeMainAppIcon);
  const storeAppImageUrl = useAppSelector(selectAppRuntimeImageUrl);
  const storeCreator = useAppSelector(selectAppRuntimeCreator);
  const storePrimaryColor = useAppSelector(selectAppRuntimeCoreBackgroundColor);
  const storeAccentColor = useAppSelector(selectAppRuntimeAccentColor);
  const storeAppletsMap = useAppSelector(selectAppletRuntimeApplets);

  const isMobile = useIsMobile();

  const hasRequiredAppConfig =
    storeIsInitialized &&
    typeof storeAppName === "string" &&
    typeof storeAppDescription === "string" &&
    typeof storeAppImageUrl === "string" &&
    typeof storeCreator === "string" &&
    typeof storePrimaryColor === "string" &&
    typeof storeAccentColor === "string";

  if (!hasRequiredAppConfig) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const renderAppletCard = (applet: CustomAppletConfig) => (
    <AppletCardAdapter
      variant={appletCardVariant}
      applet={applet}
      primaryColor={storePrimaryColor}
      accentColor={storeAccentColor}
      onClick={() => navigateToApplet(applet.slug)}
      isMobile={isMobile}
    />
  );

  // Use the MainLayoutAdapter to bring everything together
  return (
    <>
      <MainLayoutAdapter
        variant={mainLayoutVariant}
        isInitialized={storeIsInitialized}
        appName={storeAppName}
        appDescription={storeAppDescription}
        appIcon={storeAppIcon}
        appImageUrl={storeAppImageUrl}
        creator={storeCreator}
        primaryColor={storePrimaryColor}
        accentColor={storeAccentColor}
        appletList={storeAppletList}
        appletsMap={storeAppletsMap}
        navigateToApplet={navigateToApplet}
        isMobile={isMobile}
        appDisplayComponent={
          <AppDisplayAdapter
            variant={appDisplayVariant}
            appName={storeAppName}
            appDescription={storeAppDescription}
            appIcon={storeAppIcon}
            appImageUrl={storeAppImageUrl}
            creator={storeCreator}
            accentColor={storeAccentColor}
            primaryColor={storePrimaryColor}
            isMobile={isMobile}
          />
        }
        renderAppletCard={renderAppletCard}
      />
      {showColorDivs && <ColorDivs />}
    </>
  );
};

export default HomeApplet;
