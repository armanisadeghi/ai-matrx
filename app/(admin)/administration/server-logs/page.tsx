"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ServerLogsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/administration/server-logs/ai-dream-server");
  }, [router]);
  return null;
}
