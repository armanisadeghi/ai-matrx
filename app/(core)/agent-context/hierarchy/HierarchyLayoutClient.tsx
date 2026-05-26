"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Hierarchy sub-route layout: overrides the parent context layout's sidebar
 * because the hierarchy page has its own full-width split panel.
 */
export default function HierarchyLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" } as React.CSSProperties}
    >
      <div className="shrink-0 border-b border-border/50 px-4 py-1.5 bg-card/50 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1 px-2"
          asChild
        >
          <Link href="/agent-context">
            <ArrowLeft className="h-3 w-3" /> Context
          </Link>
        </Button>
        <div className="h-4 w-px bg-border mx-1" />
        <TreePine className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Hierarchy Manager</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
