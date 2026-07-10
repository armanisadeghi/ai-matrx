// /education/practice-tests/[id]/edit — authoring surface (view↔edit split).
//
// Gating (P7, ROUTING.md §2): EDIT-gated on the SERVER via requireAccess — a
// view-only sharee is redirected to the read-only `[id]` view, never dropped
// into an editor whose RLS writes would silently fail (and never shown the
// client-only dead-end Lock screen). RLS stays the boundary; this is the UX
// redirect. Mirrors flashcards/[setId]/edit — the canonical pattern.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { AssessmentEdit } from "@/features/education/assessment/components/edit/AssessmentEdit";

export const metadata: Metadata = toolMetadata("practice-tests");

export default async function PracticeTestEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAccess("assessment", id, "edit", {
    redirectTo: `/education/practice-tests/${id}`,
  });
  return <AssessmentEdit assessmentId={id} />;
}
