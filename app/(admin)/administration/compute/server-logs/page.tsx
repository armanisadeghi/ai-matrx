"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { replaceAppHref } from "@/lib/deployment/navigate";

export default function ServerLogsPage() {
  const router = useRouter();
  useEffect(() => {
    replaceAppHref(router, "/administration/compute/server-logs/ai-dream-server");
  }, [router]);
  return null;
}
