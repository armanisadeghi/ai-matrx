"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { TabLoading } from "@/features/settings/components/TabLoading";
import { Loader2 } from "lucide-react";

const MemoryManager = dynamic(() => import("@/features/memory/components/MemoryManager"), { ssr: false, loading: TabLoading });

export default function MemoryTab() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <div className="p-4 md:p-6">
        <MemoryManager />
      </div>
    </Suspense>
  );
}
