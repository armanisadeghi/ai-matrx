"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MobileUnsortedScreen } from "@/features/transcript-studio/components/mobile/MobileUnsortedScreen";

export default function MobileUnsortedPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <MobileUnsortedScreen
      onBack={() =>
        startTransition(() => router.push("/transcription/mobile"))
      }
    />
  );
}
