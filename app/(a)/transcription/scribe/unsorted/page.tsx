"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScribeUnsortedScreen } from "@/features/transcript-studio/components/scribe/ScribeUnsortedScreen";

export default function ScribeUnsortedPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <ScribeUnsortedScreen
      onBack={() => startTransition(() => router.push("/transcription/scribe"))}
    />
  );
}
