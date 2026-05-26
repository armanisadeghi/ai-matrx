import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchAIModels } from "@/features/ai-models/server/ai-models-server";
import { serverToolsService } from "@/utils/supabase/server-tools-service";
import { BuiltinEditorWrapper } from "./BuiltinEditorWrapper";

export const revalidate = 0; // Admin pages should not cache

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: builtin } = await supabase
    .from("prompt_builtins")
    .select("name, description")
    .eq("id", id)
    .single();

  const title =
    builtin?.name && builtin.name.trim() !== ""
      ? `Edit Builtin: ${builtin.name}`
      : "Edit Prompt Builtin";

  const description =
    builtin?.description &&
    typeof builtin.description === "string" &&
    builtin.description.trim() !== ""
      ? builtin.description
      : "Edit prompt builtin configuration";

  return { title, description };
}

export default async function EditBuiltinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch builtin, AI models, and tools in parallel
  const [builtinResult, aiModels, availableTools] = await Promise.all([
    supabase.from("prompt_builtins").select("*").eq("id", id).single(),
    fetchAIModels(),
    serverToolsService.fetchTools(),
  ]);

  const { data, error } = builtinResult;

  if (error || !data) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <Card className="max-w-md w-full p-8 bg-textured border-destructive/30">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Builtin Not Found
              </h2>
              <p className="text-muted-foreground">
                This prompt builtin either doesn&apos;t exist or could not be
                loaded.
              </p>
            </div>
            <Link href="/administration/prompt-builtins/builtins">
              <Button>Back to Builtins</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Transform builtin data to match PromptBuilder's initialData format
  const initialData = {
    id: data.id,
    name: data.name,
    version: data.version ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    description: data.description ?? undefined,
    messages: data.messages,
    variableDefaults: data.variable_defaults,
    settings: data.settings,
    tags: data.tags ?? undefined,
    category: data.category ?? undefined,
    isFavorite: data.is_favorite ?? false,
    isArchived: data.is_archived ?? false,
    modelId: data.model_id ?? undefined,
    outputFormat: data.output_format ?? undefined,
    outputSchema: data.output_schema ?? undefined,
  };

  return (
    <BuiltinEditorWrapper
      builtinId={data.id}
      models={aiModels}
      initialData={initialData}
      availableTools={availableTools}
    />
  );
}
