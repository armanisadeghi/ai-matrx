"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TailwindColorPicker } from "@/components/ui/TailwindColorPicker";
import { IconPicker } from "@/components/ui/IconPicker";
import { SingleImageSelect } from "@/components/image/shared/SingleImageSelect";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  setAppletIcon,
  setAppletSubmitText,
  setPrimaryColor,
  setAccentColor,
  setImageUrl,
} from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import {
  selectAppletIcon,
  selectAppletSubmitText,
  selectAppletPrimaryColor,
  selectAppletAccentColor,
  selectAppletImageUrl,
  selectAppletName,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import { AppletLayoutSelection } from "@/features/applet/builder/parts/AppletLayoutSelection";
import { EasyImageCropper } from "@/components/official/image-cropper/EasyImageCropper";
import { DEFAULT_APPLET_CONFIG } from "@/features/applet/builder/modules/smart-parts/applets/AppletFormComponent";

export interface AppletVisualsProps {
  appletId: string;
  isNew?: boolean;
  showLayoutOption?: boolean;
  showButtonOptions?: boolean;
}

export const AppletVisuals: React.FC<AppletVisualsProps> = ({
  appletId,
  isNew = false,
  showLayoutOption = true,
  showButtonOptions = true,
}) => {
  const dispatch = useAppDispatch();

  // Redux selectors for the current applet
  const appletName = useAppSelector((state: RootState) =>
    selectAppletName(state, appletId),
  );
  const appletIcon = useAppSelector((state: RootState) =>
    selectAppletIcon(state, appletId),
  );
  const appletSubmitText = useAppSelector((state: RootState) =>
    selectAppletSubmitText(state, appletId),
  );
  const appletPrimaryColor = useAppSelector((state: RootState) =>
    selectAppletPrimaryColor(state, appletId),
  );
  const appletAccentColor = useAppSelector((state: RootState) =>
    selectAppletAccentColor(state, appletId),
  );
  const appletImageUrl = useAppSelector((state: RootState) =>
    selectAppletImageUrl(state, appletId),
  );

  const handleAppletIconSelect = (iconName: string) => {
    dispatch(setAppletIcon({ id: appletId, appletIcon: iconName }));
  };

  const handleAppletColorChange = (
    colorType: "primary" | "accent",
    color: string,
  ) => {
    if (colorType === "primary") {
      dispatch(setPrimaryColor({ id: appletId, primaryColor: color }));
    } else {
      dispatch(setAccentColor({ id: appletId, accentColor: color }));
    }
  };

  const handleAppletSubmitTextChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value;
    dispatch(setAppletSubmitText({ id: appletId, appletSubmitText: value }));
  };

  const handleImageSelected = (imageUrl: string) => {
    dispatch(setImageUrl({ id: appletId, imageUrl }));
  };

  const handleImageRemoved = () => {
    dispatch(setImageUrl({ id: appletId, imageUrl: "" }));
  };

  return (
    <div className="space-y-6">
      {showButtonOptions && (
        <div className="space-y-4">
          <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Submit Button
          </Label>

          <div className="space-y-4">
            <div className="flex items-center gap-2 w-full">
              <IconPicker
                selectedIcon={appletIcon ?? DEFAULT_APPLET_CONFIG.appletIcon ?? "SiCodemagic"}
                onIconSelect={handleAppletIconSelect}
                dialogTitle="Select Submit Button"
                dialogDescription="Choose an icon to represent your submit button"
                className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg"
                primaryColor={
                  appletPrimaryColor || DEFAULT_APPLET_CONFIG.primaryColor
                }
                accentColor={
                  appletAccentColor || DEFAULT_APPLET_CONFIG.accentColor
                }
                iconType="submitIcon"
              />
              <Input
                id={`${isNew ? "new" : "edit"}-submit-text`}
                value={
                  appletSubmitText || DEFAULT_APPLET_CONFIG.appletSubmitText
                }
                onChange={handleAppletSubmitTextChange}
                className="flex-1 border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500"
                placeholder="Optional button text"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <TailwindColorPicker
                  selectedColor={
                    appletPrimaryColor || DEFAULT_APPLET_CONFIG.primaryColor
                  }
                  onColorChange={(color) =>
                    handleAppletColorChange("primary", color)
                  }
                  size="sm"
                />
                <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Primary Color
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <TailwindColorPicker
                  selectedColor={
                    appletAccentColor || DEFAULT_APPLET_CONFIG.accentColor
                  }
                  onColorChange={(color) =>
                    handleAppletColorChange("accent", color)
                  }
                  size="sm"
                />
                <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Accent Color
                </Label>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {showLayoutOption && (
          <div className="w-full space-y-2">
            <AppletLayoutSelection appletId={appletId} label="Layout Type" />
          </div>
        )}

        <div className="w-full space-y-2">
          <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Applet Image
          </Label>
          {/* <EasyImageCropper
                        onComplete={(croppedImageUrl) => {
                            console.log("Cropped image URL:", croppedImageUrl);
                        }}
                        aspectRatios={[{ label: "Sixteen Nine (16:9)", value: 16 / 9 }]}
                    />
 */}
          <SingleImageSelect
            size="sm"
            aspectRatio="landscape"
            placeholder="Select Applet Image"
            onImageSelected={handleImageSelected}
            onImageRemoved={handleImageRemoved}
            initialTab="public-search"
            initialSearchTerm={appletName ?? undefined}
            preselectedImageUrl={appletImageUrl ?? undefined}
            className="w-full max-w-md"
            instanceId={`applet-image-${appletId}`}
            saveTo="public"
          />
        </div>
      </div>
    </div>
  );
};

export default AppletVisuals;
