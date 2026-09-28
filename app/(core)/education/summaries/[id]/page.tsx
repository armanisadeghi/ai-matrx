import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SummaryDetail } from "@/features/education/onboard/components/SummaryDetail";

export const metadata: Metadata = toolMetadata("summaries");

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SummaryDetail id={id} />;
}
