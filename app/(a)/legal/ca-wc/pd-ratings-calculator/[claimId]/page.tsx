import type { Metadata } from "next";
import { SavedCaseLoader } from "@/features/legal/wc/pd-ratings/SavedCaseLoader";

export const metadata: Metadata = {
  title: "PD Ratings Calculator · Saved case",
  description:
    "California Workers' Compensation PD ratings — saved case workspace.",
};

interface SavedCasePageProps {
  params: Promise<{ claimId: string }>;
}

export default async function SavedCasePage({ params }: SavedCasePageProps) {
  const { claimId } = await params;
  return <SavedCaseLoader claimId={claimId} />;
}
