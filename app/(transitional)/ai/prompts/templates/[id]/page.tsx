import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Star } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function PromptTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch template details
  const { data: template, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !template) {
    return (
      <Card className="h-full w-full bg-textured border-none shadow-lg">
        <div className="p-8 md:p-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Template Not Found
            </h1>
            <p className="text-muted-foreground mb-4">
              The template you're looking for doesn't exist.
            </p>
            <Link href="/agents/templates">
              <Button>Back to Templates</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Card className="h-full w-full bg-textured border-none shadow-lg">
      <div className="p-8 md:p-12">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/ai/prompts/templates">
            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground">
                {template.name}
              </h1>
              {template.is_featured && (
                <Star className="h-6 w-6 text-warning" />
              )}
            </div>
            {template.description && (
              <p className="text-muted-foreground">{template.description}</p>
            )}
          </div>
          <Link href={`/ai/prompts/new?template=${id}`}>
            <Button className="bg-success hover:bg-success/90">
              <Copy className="h-4 w-4 mr-2" />
              Use This Template
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 bg-muted">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                Template Details
              </h2>

              {template.messages && (
                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">Messages</h3>
                  <pre className="bg-textured p-4 rounded-lg text-sm overflow-auto max-h-96">
                    {JSON.stringify(template.messages, null, 2)}
                  </pre>
                </div>
              )}

              {template.variable_defaults && (
                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">
                    Variable Defaults
                  </h3>
                  <pre className="bg-textured p-4 rounded-lg text-sm overflow-auto">
                    {JSON.stringify(template.variable_defaults, null, 2)}
                  </pre>
                </div>
              )}

              {template.tools && (
                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">Tools</h3>
                  <pre className="bg-textured p-4 rounded-lg text-sm overflow-auto">
                    {JSON.stringify(template.tools, null, 2)}
                  </pre>
                </div>
              )}

              {template.settings && (
                <div>
                  <h3 className="font-medium text-foreground mb-2">Settings</h3>
                  <pre className="bg-textured p-4 rounded-lg text-sm overflow-auto">
                    {JSON.stringify(template.settings, null, 2)}
                  </pre>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-muted">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                Information
              </h2>
              <div className="space-y-3">
                {template.category && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Category
                    </p>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      {template.category}
                    </Badge>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Times Used
                  </p>
                  <p className="font-medium text-foreground">
                    {template.use_count || 0}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created</p>
                  <p className="text-sm text-foreground">
                    {formatDate(template.created_at)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Last Updated
                  </p>
                  <p className="text-sm text-foreground">
                    {formatDate(template.updated_at)}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Card>
  );
}
