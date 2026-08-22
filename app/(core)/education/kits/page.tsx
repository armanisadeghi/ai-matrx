// /education/kits — every study kit the learner has (one row per source material).
import type { Metadata } from "next";
import { KitsHome } from "@/features/education/kits/components/KitsHome";

export const metadata: Metadata = {
  title: "Study Kits",
  description:
    "Every study kit you've made — each one is a piece of your material and everything created from it.",
};

export default function StudyKitsPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <KitsHome />
    </div>
  );
}
