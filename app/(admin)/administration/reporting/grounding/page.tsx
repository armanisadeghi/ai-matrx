import type { Metadata } from "next";
import { GroundingConsole } from "@/features/purpose/components/GroundingConsole";

export const metadata: Metadata = {
  title: "Purpose & Grounding",
  description:
    "Which units of work declare what job they do, who authored each purpose, and which jobs nothing serves anymore.",
};

export default function GroundingPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <GroundingConsole />
    </div>
  );
}
