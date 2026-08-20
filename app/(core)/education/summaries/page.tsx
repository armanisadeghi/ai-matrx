// /education/summaries — Study Summaries home (list-first "savior" view).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SummaryHome } from "@/features/education/onboard/components/SummaryHome";

export const metadata: Metadata = toolMetadata("summaries");

export default function SummariesToolPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <SummaryHome />
    </div>
  );
}
