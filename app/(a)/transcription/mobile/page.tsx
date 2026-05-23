"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MobileSessionsList } from "@/features/transcript-studio/components/mobile/MobileSessionsList";

export default function MobileTranscriptionPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <MobileSessionsList
      onOpenSession={(sessionId) =>
        startTransition(() => router.push(`/transcription/mobile/${sessionId}`))
      }
      onOpenUnsorted={() =>
        startTransition(() => router.push("/transcription/mobile/unsorted"))
      }
    />
  );
}
