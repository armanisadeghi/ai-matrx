import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ExternalLink, Calendar, BarChart3, Edit } from "lucide-react";
import type { PromptApp } from "@/features/prompt-apps/types/promptAppTypes";

export default async function AppsListPage() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Fetch user's apps
  const { data: apps } = await supabase
    .from("prompt_apps")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                My Prompt Apps
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your public shareable AI apps
              </p>
            </div>
            <Link href="/prompt-apps/new">
              <Button size="lg">
                <Plus className="w-4 h-4 mr-2" />
                Create New App
              </Button>
            </Link>
          </div>

          {/* Apps Grid */}
          {!apps || apps.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="pt-12 pb-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-muted rounded-full">
                    <Plus className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">No apps yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first prompt app to get started
                    </p>
                  </div>
                  <Link href="/prompt-apps/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First App
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(apps as PromptApp[]).map((app) => (
                <Card
                  key={app.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{app.name}</CardTitle>
                      <Badge
                        variant={
                          app.status === "published"
                            ? "default"
                            : app.status === "draft"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {app.status}
                      </Badge>
                    </div>
                    {app.tagline && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {app.tagline}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <BarChart3 className="w-4 h-4" />
                        <span>{app.total_executions} runs</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(app.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Tags */}
                    {app.tags && app.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {app.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {app.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{app.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Link href={`/prompt-apps/${app.id}`} className="flex-1">
                        <Button variant="outline" className="w-full">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      </Link>
                      <Link
                        href={
                          app.status === "published"
                            ? `/p/${app.slug}`
                            : `/preview/${app.id}`
                        }
                        target="_blank"
                        className="flex-1"
                      >
                        <Button className="w-full">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          {app.status === "published" ? "Run" : "Test"}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
