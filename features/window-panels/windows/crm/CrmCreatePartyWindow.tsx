"use client";

import { useRouter } from "next/navigation";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { PartyCreateForm } from "@/features/crm/components/PartyCreateForm";
import type { PartyKind } from "@/features/crm/types";
import { CRM_CREATE_PARTY_SURFACE_NAME } from "@/features/surfaces/manifests/crm-create-party.manifest";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

export interface CrmCreatePartyWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialKind?: PartyKind;
  initialOrgId?: string | null;
}

export default function CrmCreatePartyWindow({
  isOpen,
  onClose,
  initialKind,
  initialOrgId,
}: CrmCreatePartyWindowProps) {
  const router = useRouter();
  if (!isOpen) return null;

  return (
    <WindowPanel
      id="crm-create-party-window"
      overlayId="crmCreatePartyWindow"
      title={getSurfaceDisplayLabel(CRM_CREATE_PARTY_SURFACE_NAME)}
      width={520}
      height={560}
      minWidth={420}
      minHeight={460}
      position="center"
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <PartyCreateForm
        initialKind={initialKind}
        initialOrgId={initialOrgId}
        onCancel={onClose}
        onCreated={(partyId) => {
          onClose();
          router.push(`/crm/${partyId}`);
        }}
      />
    </WindowPanel>
  );
}
