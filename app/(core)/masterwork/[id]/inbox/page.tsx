// app/(core)/masterwork/[id]/inbox/page.tsx
//
// "Shadow your inbox" — the `shadow_inbox` Distillation Approach as a REAL
// PAGE (Arman's ruling, 2026-08-17: every creation/working mode gets a URL).
// ONE implementation: this route renders the exact same `ShadowInboxDialog`
// lane (`variant="page"`) the Rulebook page opens as a dialog
// (`?shadowInbox=1` / the Approach picker).

"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ShadowInboxDialog } from "@/features/masterwork/components/detail/ShadowInboxDialog";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookShadowInboxRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="inbox"
      title="Shadow your inbox"
      requireOwner
      ownerMessage="Only the Rulebook's owner can shadow their mail into it."
    >
      {({ rulebook, reload }) => (
        <ShadowInboxDialog
          variant="page"
          open
          onOpenChange={(open) => {
            if (!open) router.push(`/masterwork/${id}`);
          }}
          rulebook={rulebook}
          onIngested={reload}
          onFollowupSeed={(seed) => {
            // The gaps follow-up rides the interview route's ?seed= deep link.
            router.push(
              `/masterwork/${id}/interview?new=1&seed=${encodeURIComponent(seed)}`,
            );
          }}
        />
      )}
    </RulebookLaneRoute>
  );
}
