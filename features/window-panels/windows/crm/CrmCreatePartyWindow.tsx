"use client";

import { useRouter } from "next/navigation";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { PartyCreateForm } from "@/features/crm/components/PartyCreateForm";
import type { PartyKind } from "@/features/crm/types";
import { CRM_CREATE_PARTY_SURFACE_NAME } from "@/features/surfaces/manifests/crm-create-party.manifest";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

export interface CrmCreatePartyWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialKind?: PartyKind;
  initialOrgId?: string | null;
  initialName?: string | null;
}

export default function CrmCreatePartyWindow({
  isOpen,
  onClose,
  initialKind,
  initialOrgId,
  initialName,
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
      {/*
       * No entity: this form CREATES a party — there is no record yet to
       * right-click. Plain raw-content menu so the window still answers for
       * itself rather than leaking to the page open behind it.
       */}
      <NonEditableContextMenu
        sourceFeature="crm"
        contentSource={{ type: "raw" }}
        contextData={{ content: initialName ?? "" }}
      >
        <PartyCreateForm
          initialKind={initialKind}
          initialOrgId={initialOrgId}
          initialName={initialName}
          onCancel={onClose}
          onCreated={(partyId) => {
            onClose();
            router.push(`/crm/${partyId}`);
          }}
        />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
