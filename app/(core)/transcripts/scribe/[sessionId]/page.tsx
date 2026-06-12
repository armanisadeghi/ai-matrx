"use client";

import { useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScribeScreen } from "@/features/transcript-studio/components/scribe/ScribeScreen";

export default function ScribeSessionPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const [, startTransition] = useTransition();

  return (
    <ScribeScreen
      sessionId={params.sessionId}
      onBack={() => startTransition(() => router.push("/transcripts/scribe"))}
    />
  );
}
