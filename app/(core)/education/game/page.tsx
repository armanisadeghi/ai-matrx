// /education/game — the Study Games home (list-first "savior" view, NOT a
// forced detail page). Server shell (no "use client"): metadata for SEO + the
// client island. EngageHome is a "use client" leaf, so importing it here forms
// the client boundary and Next.js code-splits it automatically.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EngageHome } from "@/features/education/engage/components/EngageHome";

export const metadata: Metadata = toolMetadata("game");

export default function StudyGamesPage() {
  return (
    <div className="h-full overflow-hidden">
      <EngageHome />
    </div>
  );
}
