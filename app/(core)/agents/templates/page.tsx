import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { TemplatesGrid } from "@/features/agents/agent-creators/templates/TemplatesGrid";

export default async function AgentTemplatesPage() {
  const supabase = await createClient();

  const { data: templates, error } = await supabase
    .from("agx_agent_templates")
    .select(
      "id, name, description, category, is_featured, use_count, created_at, updated_at",
    )
    .eq("is_archived", false)
    .order("is_featured", { ascending: false })
    .order("use_count", { ascending: false });

  if (error) {
    console.error("Error fetching agent templates:", error);
    throw new Error("Failed to fetch agent templates");
  }

  return (
    <Card className="h-full w-full bg-textured border-none shadow-lg">
      <div className="p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4 sm:mb-6 md:mb-8 gap-3 sm:gap-4">
          <div className="flex items-start gap-2.5 sm:gap-3 md:gap-4">
            <Link href="/agents">
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-accent h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1 sm:mb-2">
                Agent Templates
              </h1>
              <p className="text-sm text-muted-foreground">
                Start from a pre-built template and customize it to your needs.
              </p>
            </div>
          </div>
        </div>

        <TemplatesGrid templates={templates || []} />
      </div>
    </Card>
  );
}
