import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { requireAccess } from "@/utils/permissions/requireAccess";
import { SummaryDetail } from "@/features/education/onboard/components/SummaryDetail";

export const metadata: Metadata = toolMetadata("summaries");

export default async function SummaryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccess("study_media", id, "edit", { redirectTo: `/education/summaries/${id}` });
  return <SummaryDetail id={id} edit />;
}
