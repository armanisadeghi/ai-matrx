"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useContextScope } from "@/features/agent-context/hooks/useContextScope";
import { ContextDashboard } from "@/features/agent-context/components/ContextDashboard";
import { ContextItemList } from "@/features/agent-context/components/ContextItemList";
import { ContextTemplateBrowser } from "@/features/agent-context/components/ContextTemplateBrowser";
import {
  LayoutDashboard,
  FileText,
  LayoutTemplate,
  TreePine,
  ArrowRight,
} from "lucide-react";

export default function ContextPage() {
  const { scope } = useContextScope();

  return (
    <div className="space-y-4">
      {/* Hierarchy Manager CTA */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <TreePine className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Hierarchy Manager</p>
          <p className="text-xs text-muted-foreground">
            Full tree view — navigate, create, and manage all your
            organizations, workspaces, projects, and tasks in one place.
          </p>
        </div>
        <Button size="sm" className="text-xs gap-1 shrink-0" asChild>
          <Link href="/agent-context/hierarchy">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs gap-1.5 h-7">
            <LayoutDashboard className="h-3 w-3" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="items" className="text-xs gap-1.5 h-7">
            <FileText className="h-3 w-3" />
            Items
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1.5 h-7">
            <LayoutTemplate className="h-3 w-3" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <ContextDashboard scope={scope} />
          </Suspense>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <ContextItemList scope={scope} />
          </Suspense>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <ContextTemplateBrowser scope={scope} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
