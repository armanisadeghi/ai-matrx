import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinClassView } from "@/features/education/classes/components/JoinClassView";

export const metadata: Metadata = {
  title: "Join a class",
  description: "Enter the class code your teacher shared to join their class.",
};

export default function JoinClassPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <Suspense>
        <JoinClassView />
      </Suspense>
    </div>
  );
}
