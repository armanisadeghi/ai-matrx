import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Star } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { UseTemplateButton } from "@/features/agents/agent-creators/templates/UseTemplateButton";

export default async function AgentTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: template, error } = await supabase
    .from("agx_agent_templates")
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
              The template you&apos;re looking for doesn&apos;t exist.
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
          <Link href="/agents/templates">
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
          <UseTemplateButton templateId={id} />
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

              {template.variable_definitions && (
                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">
                    Variable Definitions
                  </h3>
                  <pre className="bg-textured p-4 rounded-lg text-sm overflow-auto">
                    {JSON.stringify(template.variable_definitions, null, 2)}
                  </pre>
                </div>
              )}

              {template.tools && template.tools.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-medium text-foreground mb-2">Tools</h3>
                  <pre className="bg-textured p-4 rounded-lg text-sm overflow-auto">
                    {JSON.stringify(template.tools, null, 2)}
                  </pre>
                </div>
              )}

              {template.settings &&
                Object.keys(template.settings).length > 0 && (
                  <div>
                    <h3 className="font-medium text-foreground mb-2">
                      Settings
                    </h3>
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

                {template.tags && template.tags.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {template.tags.map((tag: string) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-muted-foreground border-border text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
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
