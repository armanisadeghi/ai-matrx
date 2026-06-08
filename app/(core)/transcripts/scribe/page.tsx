"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScribeSessionsList } from "@/features/transcript-studio/components/scribe/ScribeSessionsList";

export default function ScribePage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <ScribeSessionsList
      onOpenSession={(sessionId) =>
        startTransition(() => router.push(`/transcripts/scribe/${sessionId}`))
      }
      onOpenUnsorted={() =>
        startTransition(() => router.push("/transcripts/scribe/unsorted"))
      }
    />
  );
}
