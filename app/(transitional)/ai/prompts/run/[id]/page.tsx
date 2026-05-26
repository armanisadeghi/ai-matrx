import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Metadata } from "next";
import { PromptRunPage } from "@/features/prompts/components/PromptRunPage";
import { Suspense } from "react";
import type { PromptAccessInfo } from "@/features/prompts/types/shared";

// Cache AI models data for 12 hours
export const revalidate = 43200;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch prompt for metadata
  const { data: prompt } = await supabase
    .from("prompts")
    .select("name, description")
    .eq("id", id)
    .single();

  // Generate title
  const title =
    prompt?.name && prompt.name.trim() !== ""
      ? `${prompt.name} Prompt`
      : "Run Prompt";

  // Generate description
  const description =
    prompt?.description &&
    typeof prompt.description === "string" &&
    prompt.description.trim() !== ""
      ? prompt.description
      : "Run and test your AI prompt with live configuration";

  return {
    title,
    description,
  };
}

export default async function RunPromptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch prompt by ID and access level in parallel (RLS handles access control)
  const [promptResult, accessLevelResult] = await Promise.all([
    supabase.from("prompts").select("*").eq("id", id).single(),
    supabase.rpc("get_prompt_access_level", { prompt_id: id }),
  ]);

  const { data: prompt, error } = promptResult;
  const { data: accessData, error: accessError } = accessLevelResult;

  // Transform access data
  let accessInfo: PromptAccessInfo | undefined;
  if (accessData && accessData.length > 0) {
    const access = accessData[0];
    accessInfo = {
      isOwner: access.is_owner,
      permissionLevel:
        access.permission_level as PromptAccessInfo["permissionLevel"],
      ownerEmail: access.owner_email,
      canEdit: access.can_edit,
      canDelete: access.can_delete,
    };
  }

  if (accessError) {
    console.error("Error fetching access level:", accessError);
  }

  // Handle not found or access denied
  if (error || !prompt) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <Card className="max-w-md w-full p-8 bg-textured border-destructive/30">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Prompt Not Found
              </h2>
              <p className="text-muted-foreground">
                This prompt either doesn't exist or you don't have permission to
                access it.
              </p>
            </div>
            <Link href="/ai/prompts">
              <Button>Back to Prompts</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Prepare prompt data for PromptRunner (include all fields for caching)
  const promptData = {
    id: prompt.id,
    name: prompt.name || "",
    description: prompt.description || "",
    messages: prompt.messages || [],
    variableDefaults: prompt.variable_defaults || [],
    settings: prompt.settings || {},
    userId: prompt.user_id || "",
    tags: prompt.tags ?? null,
    category: prompt.category ?? null,
    isFavorite: prompt.is_favorite ?? false,
    isArchived: prompt.is_archived ?? false,
    modelId: prompt.model_id ?? null,
    outputFormat: prompt.output_format ?? null,
    outputSchema: prompt.output_schema ?? null,
  };

  return (
    <Suspense
      fallback={
        <div className="h-page flex items-center justify-center bg-textured">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">
              Loading prompt runner...
            </p>
          </div>
        </div>
      }
    >
      <PromptRunPage promptData={promptData} accessInfo={accessInfo} />
    </Suspense>
  );
}
