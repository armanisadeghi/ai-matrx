import { Suspense } from "react";
import { AiWorkHeader } from "@/features/ai-work/components/AiWorkHeader";
import { LiveHub } from "@/features/ai-work/live/components/LiveHub";

export function generateMetadata() {
  return { title: "Live" };
}

export default function WorkLivePage() {
  return (
    <>
      <AiWorkHeader />
      <Suspense>
        <LiveHub />
      </Suspense>
    </>
  );
}
