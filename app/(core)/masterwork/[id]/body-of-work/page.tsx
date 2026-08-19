// app/(core)/masterwork/[id]/body-of-work/page.tsx
//
// "Everything you've published" — the body_of_work Distillation Approach as a
// REAL PAGE (Arman's ruling, 2026-08-17: every creation/working mode gets a
// URL). ONE implementation: this route renders the exact same
// `BodyOfWorkDialog` lane (`variant="page"`) the Rulebook page opens as a
// dialog — `?body_of_work=1` on the detail page keeps opening the dialog.

"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { BodyOfWorkDialog } from "@/features/masterwork/components/detail/BodyOfWorkDialog";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookBodyOfWorkRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="body-of-work"
      title="Your published work"
      requireOwner
      ownerMessage="Only the Rulebook's owner can distill their published work into it."
    >
      {({ rulebook, reload }) => (
        <BodyOfWorkDialog
          variant="page"
          open
          onOpenChange={(open) => {
            if (!open) router.push(`/masterwork/${id}`);
          }}
          rulebook={rulebook}
          onIngested={reload}
        />
      )}
    </RulebookLaneRoute>
  );
}
