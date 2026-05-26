"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppletLayoutSelection } from "@/features/applet/builder/parts/AppletLayoutSelection";
import { IconPicker } from "@/components/ui/IconPicker";
import { DEFAULT_APPLET_CONFIG } from "@/features/applet/builder/modules/smart-parts/applets/AppletFormComponent";
import {
  selectAppletIcon,
  selectAppletSubmitText,
  selectAppletPrimaryColor,
  selectAppletAccentColor,
  selectAppletImageUrl,
  selectAppletName,
} from "@/lib/redux/app-builder/selectors/appletSelectors";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  setAppletIcon,
  setAppletSubmitText,
} from "@/lib/redux/app-builder/slices/appletBuilderSlice";

interface LayoutEditTabProps {
  appletId: string;
  layoutType?: string;
  appletSubmitText?: string;
  overviewLabel?: string;
  onUpdate: (field: string, value: string) => void;
}

export default function LayoutEditTab({
  appletId,
  layoutType,
  overviewLabel,
  onUpdate,
}: LayoutEditTabProps) {
  const dispatch = useAppDispatch();
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

  const handleAppletIconSelect = (iconName: string) => {
    dispatch(setAppletIcon({ id: appletId, appletIcon: iconName }));
  };
  const handleAppletSubmitTextChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value;
    dispatch(setAppletSubmitText({ id: appletId, appletSubmitText: value }));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <AppletLayoutSelection appletId={appletId} label="Layout Type" />
          </div>

          <div>
            <Label htmlFor="applet-submit-text">Submit Button</Label>
            <div className="flex items-center gap-2 w-full">
              <IconPicker
                selectedIcon={appletIcon || DEFAULT_APPLET_CONFIG.appletIcon}
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
                id={`applet-submit-text`}
                value={
                  appletSubmitText || DEFAULT_APPLET_CONFIG.appletSubmitText
                }
                onChange={handleAppletSubmitTextChange}
                className="flex-1 border-gray-200 dark:border-gray-700 bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500"
                placeholder="Optional button text"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="overview-label">Overview Label</Label>
            <Input
              id="overview-label"
              value={overviewLabel || ""}
              onChange={(e) => onUpdate("overviewLabel", e.target.value)}
              placeholder="Enter overview label"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This label is used in several ways:
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  After the user submits, all containers are replaced with a
                  single, collapsed container holding all fields. This is the
                  label that will be used.
                </li>
                <li>It replaces the message for the 'Minimalist' Layout.</li>
                <li>It is used as the label for the overview section.</li>
              </ul>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
