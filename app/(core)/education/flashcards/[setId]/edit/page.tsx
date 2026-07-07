// /education/flashcards/[setId]/edit — authoring surface (view↔edit split).
// Server shell: resolves async params, then renders the client editor island.
// EditSetView is a "use client" leaf (inline card editing, set rename, add card)
// — importing it here forms the client boundary (Next.js code-splits it).
//
// Gating (P7): EDIT-gated via requireAccess — a view-only sharee is redirected to
// the read-only `[setId]` view (which offers "Make a copy"), never dropped into
// an editor whose RLS writes would silently fail. RLS stays the boundary.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { EditSetView } from "@/features/flashcards/components/editor/EditSetView";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardEditPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardEditPage({
  params,
}: FlashcardEditPageProps) {
  const { setId } = await params;
  await requireAccess("fc_set", setId, "edit", {
    redirectTo: `/education/flashcards/${setId}`,
  });
  return <EditSetView setId={setId} />;
}
