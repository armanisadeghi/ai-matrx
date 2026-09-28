import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SummaryEditor } from "@/features/education/onboard/components/SummaryEditor";

export const metadata: Metadata = toolMetadata("summaries");

export default function NewSummaryPage() {
  return <SummaryEditor />;
}
