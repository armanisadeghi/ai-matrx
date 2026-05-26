"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { Loader2 } from "lucide-react";

export default function ImportAgentPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  useEffect(() => {
    dispatch(openOverlay({ overlayId: "agentImportWindow", data: {} }));
    router.replace("/agents/new");
  }, [dispatch, router]);

  return (
    <div className="flex items-center justify-center h-[calc(100dvh-var(--header-height))]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
