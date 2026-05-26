import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ToolEditPage } from "@/features/tool-call-visualization/admin/mcp-tools/ToolEditPage";
import { Loader2 } from "lucide-react";

interface Props {
  params: Promise<{ toolId: string }>;
}

async function fetchTool(toolId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tl_def")
    .select("*")
    .eq("id", toolId)
    .single();
  if (error || !data) return null;
  return data;
}

export default async function ToolEditRoute({ params }: Props) {
  const { toolId } = await params;
  const tool = await fetchTool(toolId);
  if (!tool) notFound();

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100dvh-var(--header-height))] gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading editor…
        </div>
      }
    >
      <ToolEditPage tool={tool} />
    </Suspense>
  );
}
