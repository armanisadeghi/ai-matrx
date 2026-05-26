import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchAIModels } from "@/features/ai-models/server/ai-models-server";

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
      : "View Prompt";

  // Generate description
  const description =
    prompt?.description &&
    typeof prompt.description === "string" &&
    prompt.description.trim() !== ""
      ? prompt.description
      : "View your AI prompt details and configuration";

  return {
    title,
    description,
  };
}

export default async function ViewPromptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch prompt by ID (RLS handles access control) and AI models in parallel
  const [promptResult, aiModels] = await Promise.all([
    supabase.from("prompts").select("*").eq("id", id).single(),
    fetchAIModels(),
  ]);

  const { data: prompt, error } = promptResult;

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

  return (
    <div className="h-full w-full p-8">
      <Card className="bg-textured border-border">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground">View Prompt</h1>
          <p className="text-muted-foreground mt-1">
            {prompt.name || "Untitled Prompt"}
          </p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Prompt Data
            </h2>
            <div className="rounded-lg bg-muted border border-border overflow-hidden">
              <pre className="p-4 overflow-auto text-sm text-foreground whitespace-pre-wrap break-words">
                {JSON.stringify(prompt, null, 2)}
              </pre>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Available AI Models
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (Cached for 12 hours)
              </span>
            </h2>
            <div className="rounded-lg bg-muted border border-border overflow-hidden">
              <pre className="p-4 overflow-auto text-sm text-foreground whitespace-pre-wrap break-words">
                {JSON.stringify(aiModels, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
