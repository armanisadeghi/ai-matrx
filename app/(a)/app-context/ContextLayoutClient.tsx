"use client";

import { Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HierarchyTree } from "@/features/agent-context/components/hierarchy-selection/HierarchyTree";
import { HierarchyBreadcrumb } from "@/features/agent-context/components/hierarchy-selection/HierarchyBreadcrumb";
import {
  EMPTY_SELECTION,
  type HierarchySelection,
} from "@/features/agent-context/components/hierarchy-selection/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContextLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHierarchyPage = pathname?.includes("/hierarchy");

  if (isHierarchyPage) {
    return <>{children}</>;
  }

  return <ContextShellLayout>{children}</ContextShellLayout>;
}

function ContextShellLayout({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden"
      style={
        {
          "--header-height": "var(--shell-header-h)",
          paddingTop: "var(--shell-header-h)",
        } as React.CSSProperties
      }
    >
      <div className="shrink-0 border-b border-border/50 px-4 py-1.5 bg-card/50 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <PanelLeft className="h-3.5 w-3.5" />
          )}
        </Button>
        <Suspense fallback={<Skeleton className="h-5 w-48" />}>
          <HierarchyBreadcrumb
            levels={["organization", "scope", "project", "task"]}
            value={selection}
            onChange={setSelection}
          />
        </Suspense>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <div className="w-[280px] shrink-0 border-r border-border/50 bg-card/30 overflow-hidden flex flex-col">
            <Suspense fallback={<SidebarSkeleton />}>
              <HierarchyTree
                levels={["organization", "scope", "project", "task"]}
                value={selection}
                onChange={setSelection}
              />
            </Suspense>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 sm:px-6 md:px-8 py-4 max-w-[1600px]">
            <Suspense fallback={<ContentSkeleton />}>{children}</Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="p-3 space-y-2">
      <Skeleton className="h-7 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-6"
          style={{ width: `${70 - i * 5}%`, marginLeft: `${i * 12}px` }}
        />
      ))}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
