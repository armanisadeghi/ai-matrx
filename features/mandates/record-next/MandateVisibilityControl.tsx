"use client";

// features/mandates/record-next/MandateVisibilityControl.tsx
//
// WHO CAN SEE A MANDATE I CREATED — the record page's share control, and it is the
// PLATFORM share dialog (`features/sharing/components/ShareModal`), not a mandate-only
// picker. The same dialog shares a note, an agent or a workflow.
//
// SHARE ≠ MOVE (2026-09-25). Sharing never changes the mandate's home or owner:
//   People tab → a grant to each person named; "Add everyone in <organization>" names each
//                current member (a share names PEOPLE, never an organization — SHARE-PEOPLE-ONLY);
//                they see it under "Shared" and can bind it at their own level
//   Public tab → visibility public; everyone sees it under "Public"
// A mandate homed in my personal workspace is not offered "Everyone in <workspace>" in the
// lane control (nobody else is in it); one homed in an organization is.
// `mandate` is in platform.shareable_resource_registry (mandate_share_without_move.sql),
// and mandate.definition's RLS honours the grants through iam.has_access('mandate', …).
// Proof from each viewer's seat: `pnpm check:mandate-sharing-lanes`.

import { useState } from "react";
import { Globe, Lock, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { invalidateMandateCache } from "@/features/mandates/service";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectPersonalOrganizationId } from "@/lib/redux/slices/appContextSlice";

type Mandate = MandateWorkspaceData["mandate"];

/** The button's words for the stored visibility. Grants are counted inside the dialog. Pure. */
export function mandateShareButtonLabel(visibility: string | null | undefined): string {
  return visibility === "public" || visibility === "link" ? "Public" : "Share";
}

export function MandateVisibilityControl({
  mandate,
  onChanged,
}: {
  mandate: Mandate;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const personalOrgId = useAppSelector(selectPersonalOrganizationId);
  const isPublic = mandate.visibility === "public" || mandate.visibility === "link";
  const Icon = isPublic ? Globe : mandate.visibility === "personal" ? Lock : Share2;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => setOpen(true)}
      >
        <Icon className="h-3.5 w-3.5" />
        {mandateShareButtonLabel(mandate.visibility)}
      </Button>
      {open ? (
        <ShareModal
          isOpen={open}
          onClose={() => {
            setOpen(false);
            // Visibility may have changed inside the dialog; the row and its cache re-read.
            invalidateMandateCache(mandate.mandate_key);
            onChanged();
          }}
          resourceType="mandate"
          resourceId={mandate.id}
          resourceName={mandateDisplayName(mandate.mandate_key, mandate.label)}
          resourceNoun="mandate"
          personalHome={Boolean(personalOrgId) && mandate.organization_id === personalOrgId}
        />
      ) : null}
    </>
  );
}
