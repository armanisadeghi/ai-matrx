// /education/tutor — the AI Tutor home (list-first "savior" view: start a new
// session or resume a past one). Server shell (no "use client"): metadata +
// the client list island. TutorHome is a "use client" leaf, so importing it
// here forms the client boundary and Next.js code-splits it automatically.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { TutorHome } from "@/features/education/tutor/components/TutorHome";

export const metadata: Metadata = toolMetadata("tutor");

export default function TutorToolPage() {
  return <TutorHome />;
}
