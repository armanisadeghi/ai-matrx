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
//   Public tab → published to the web; everyone sees it under "Public"
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
import { PUBLISHED_TO_WEB_LABEL } from "@/lib/row-access";

type Mandate = MandateWorkspaceData["mandate"];

/** The button's words for the mandate's web state. Grants are counted inside the dialog. Pure. */
export function mandateShareButtonLabel(publishedToWeb: boolean | null | undefined): string {
  return publishedToWeb ? PUBLISHED_TO_WEB_LABEL : "Share";
}

export function MandateVisibilityControl({
  mandate,
  onChanged,
}: {
  mandate: Mandate;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = mandate.published_to_web ? Globe : mandate.shown_to === "only_me" ? Lock : Share2;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => setOpen(true)}
      >
        <Icon className="h-3.5 w-3.5" />
        {mandateShareButtonLabel(mandate.published_to_web)}
      </Button>
      {open ? (
        <ShareModal
          isOpen={open}
          onClose={() => {
            setOpen(false);
            // Sharing or publishing may have changed inside the dialog; the row and its cache re-read.
            invalidateMandateCache(mandate.mandate_key);
            onChanged();
          }}
          resourceType="mandate"
          resourceId={mandate.id}
          resourceName={mandateDisplayName(mandate.mandate_key, mandate.label)}
          resourceNoun="mandate"
        />
      ) : null}
    </>
  );
}
