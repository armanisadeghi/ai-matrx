"use client";

import { useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { MobileStudioScreen } from "@/features/transcript-studio/components/mobile/MobileStudioScreen";

export default function MobileSessionPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const [, startTransition] = useTransition();

  return (
    <MobileStudioScreen
      sessionId={params.sessionId}
      onBack={() =>
        startTransition(() => router.push("/transcription/mobile"))
      }
    />
  );
}
