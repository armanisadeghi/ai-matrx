// /education/flashcards/[setId]/edit — authoring surface (view↔edit split).
// Server shell: resolves async params, then renders the client editor island.
// EditSetView is a "use client" leaf (inline card editing, set rename, add card)
// — importing it here forms the client boundary (Next.js code-splits it).
//
// Gating: writes are RLS-gated at the DB (you can only edit sets you own); the
// VIEW-vs-EDIT permission split + duplicate-to-edit guard for view-only sharees
// is the Wave-5 sharing follow-up (ROUTING.md §2).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EditSetView } from "@/features/flashcards/components/editor/EditSetView";

export const metadata: Metadata = toolMetadata("flashcards");

interface FlashcardEditPageProps {
  params: Promise<{ setId: string }>;
}

export default async function FlashcardEditPage({
  params,
}: FlashcardEditPageProps) {
  const { setId } = await params;
  return <EditSetView setId={setId} />;
}
