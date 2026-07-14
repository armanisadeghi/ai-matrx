// /education/family — the Parent / Guardian hub (list-first "savior" view, NOT a
// forced detail page). Server shell (no "use client"): metadata for SEO + the
// client island. FamilyDashboard is a "use client" leaf, so importing it here
// forms the client boundary and Next.js code-splits it automatically.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { FamilyDashboard } from "@/features/education/family/components/FamilyDashboard";

export const metadata: Metadata = toolMetadata("family");

export default function EducationFamilyPage() {
  return (
    <div className="h-full overflow-hidden">
      <FamilyDashboard />
    </div>
  );
}
