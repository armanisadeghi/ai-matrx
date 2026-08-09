// File: features/applet/runner/layouts/options/horizontal-layout/HorizontalSearchLayout.tsx
"use client";

import React from "react";
import { AppletInputProps } from "@/features/applet/runner/layouts/AppletLayoutManager";
import SearchGroupField from "@/features/applet/runner/layouts/core/SearchGroupField";
import AppletBrokerContainer from "@/features/applet/runner/layouts/options/horizontal-layout/AppletBrokerContainer";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletRuntimeContainers } from "@/lib/redux/app-runner/slices/customAppletRuntimeSlice";

const HorizontalSearchLayout: React.FC<AppletInputProps> = ({
  appletId,
  activeContainerId,
  setActiveContainerId,
  actionButton,
  className = "",
  isMobile = false,
  source = "applet",
}) => {
  const appletContainers = useAppSelector((state) =>
    selectAppletRuntimeContainers(state, appletId),
  );

  const groupsCount = appletContainers.length;
  const hideContainerPlaceholder = groupsCount > 4;

  return (
    <div className="w-full p-4">
      <AppletBrokerContainer
        activeContainerId={activeContainerId}
        onActiveContainerChange={setActiveContainerId}
        actionButton={actionButton}
        className={`mx-auto max-w-4xl rounded-full bg-card ${className}`}
      >
        {appletContainers.map((container, index) => (
          <SearchGroupField
            key={container.id}
            id={container.id}
            appletId={appletId}
            label={container.label}
            description={container.description}
            fields={container.fields}
            isActive={activeContainerId === container.id}
            onClick={() => {}} // Managed by AppletBrokerContainer
            onOpenChange={() => {}} // Managed by AppletBrokerContainer
            isLast={index === appletContainers.length - 1}
            actionButton={actionButton}
            className={className}
            isMobile={isMobile}
            hideContainerPlaceholder={hideContainerPlaceholder}
            source={source}
          />
        ))}
      </AppletBrokerContainer>
    </div>
  );
};

export default HorizontalSearchLayout;
