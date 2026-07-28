"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CrmListPage } from "@/features/crm/components/CrmListPage";
import { CRM_MANAGER_SURFACE_NAME } from "@/features/surfaces/manifests/crm-manager.manifest";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

export interface CrmManagerWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CrmManagerWindow({
  isOpen,
  onClose,
}: CrmManagerWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id="crm-manager-window"
      overlayId="crmManagerWindow"
      title={getSurfaceDisplayLabel(CRM_MANAGER_SURFACE_NAME)}
      width={1100}
      height={720}
      minWidth={720}
      minHeight={480}
      position="center"
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <CrmListPage
        presentation="window"
        surfaceName={CRM_MANAGER_SURFACE_NAME}
      />
    </WindowPanel>
  );
}
