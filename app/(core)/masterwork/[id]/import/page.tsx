// app/(core)/masterwork/[id]/import/page.tsx
//
// "Import your AI chats" — the chat-import Distillation Approach as a REAL
// PAGE (Arman's ruling, 2026-08-17: every creation/working mode gets a URL).
// ONE implementation: this route renders the exact same `ChatImportDialog`
// lane (`variant="page"`) the Rulebook page opens as a dialog
// (`?chatImport=1` / the "Your AI chats" toolbar button). `?conversation=<id>`
// preselects AI Matrx conversations on the AI Matrx tab.

"use client";

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatImportDialog } from "@/features/masterwork/components/detail/ChatImportDialog";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookChatImportRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  // `?conversation=<id>` (repeatable) arrives from "Make an agent from this chat"
  // → Masterwork: the AI Matrx tab opens with that chat already selected.
  const conversationIds = useSearchParams().getAll("conversation");
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="import"
      title="Import your AI chats"
      requireOwner
      ownerMessage="Only the Rulebook's owner can distill their AI chats into it."
    >
      {({ rulebook, reload }) => (
        <ChatImportDialog
          variant="page"
          open
          onOpenChange={(open) => {
            if (!open) router.push(`/masterwork/${id}`);
          }}
          rulebook={rulebook}
          initialTab={conversationIds.length > 0 ? "matrx" : undefined}
          initialSelectedConversationIds={conversationIds}
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
