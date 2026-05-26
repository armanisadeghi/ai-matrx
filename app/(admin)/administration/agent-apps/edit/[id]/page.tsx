"use client";

import React, {
  use,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { AgentAppAdminActions } from "@/features/agent-apps/components/AgentAppAdminActions";
import { AgentAppEditor } from "@/features/agent-apps/components/AgentAppEditor";
import { UpdateAgentAppModal } from "@/features/agent-apps/components/UpdateAgentAppModal";
import type { AgentApp } from "@/features/agent-apps/types";
import type {
  AgentAppAdminView,
  UpdateAgentAppAdminInput,
} from "@/lib/services/agent-apps-admin-service";
import {
  getAgentAppById,
  updateAgentAppAdmin,
} from "@/lib/services/agent-apps-admin-service";

function toAgentApp(row: AgentAppAdminView & Record<string, any>): AgentApp {
  return row as unknown as AgentApp;
}

export default function AdminEditAgentAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [app, setApp] = useState<AgentAppAdminView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await getAgentAppById(id);
      if (!data) {
        setNotFound(true);
        setApp(null);
      } else {
        setApp(data);
      }
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load agent app",
        variant: "destructive",
      });
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const goToList = () => {
    startTransition(() => {
      router.push("/administration/agent-apps/apps");
    });
  };

  const handleAdminUpdate = async (
    patch: Partial<UpdateAgentAppAdminInput>,
  ) => {
    if (!app) return;
    try {
      const updated = await updateAgentAppAdmin({ id: app.id, ...patch });
      setApp(updated);
      toast({ title: "Updated", description: "Admin settings saved" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to update agent app",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    try {
      const res = await fetch(`/api/agent-apps/${app.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      toast({ title: "Deleted", description: `${app.name} removed` });
      goToList();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete agent app",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleSaveComponentCode = async (appId: string, input: any) => {
    try {
      const res = await fetch(`/api/agent-apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      const saved = await res.json();
      setApp((prev) =>
        prev ? { ...prev, ...(saved as AgentAppAdminView) } : prev,
      );
      toast({ title: "Saved", description: "Component code updated" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save component",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleSaveMetadata = async (appId: string, input: any) => {
    try {
      const res = await fetch(`/api/agent-apps/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }
      const saved = await res.json();
      setApp((prev) =>
        prev ? { ...prev, ...(saved as AgentAppAdminView) } : prev,
      );
      toast({ title: "Saved", description: "App metadata updated" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save metadata",
        variant: "destructive",
      });
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-2.5rem)] flex items-center justify-center bg-textured">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agent app...
        </div>
      </div>
    );
  }

  if (notFound || !app) {
    return (
      <div className="h-[calc(100vh-2.5rem)] flex items-center justify-center p-6 bg-textured">
        <Card className="max-w-md w-full border-destructive/30">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="p-3 bg-destructive/10 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Agent app not found
              </h2>
              <p className="text-sm text-muted-foreground">
                This app doesn&apos;t exist or has been removed.
              </p>
            </div>
            <Link href="/administration/agent-apps/apps">
              <Button size="sm">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to apps
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 px-4 h-12 border-b border-border bg-card flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToList}
          disabled={isPending}
          className="-ml-2"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <ArrowLeft className="h-4 w-4 mr-1.5" />
          )}
          Back
        </Button>
        <div className="text-sm text-muted-foreground truncate flex items-center gap-2">
          Editing{" "}
          <span className="font-medium text-foreground">{app.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {app.status}
          </Badge>
          <a
            href={`/p/${app.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
          >
            /p/{app.slug}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="admin" className="h-full flex flex-col">
          <div className="border-b border-border px-4 bg-card">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              <TabsTrigger
                value="admin"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Admin Controls
              </TabsTrigger>
              <TabsTrigger
                value="code"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Component Code
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="admin"
            className="flex-1 overflow-hidden m-0 data-[state=active]:flex"
          >
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-4xl mx-auto space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Metadata</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMetadataOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit name / tagline
                    </Button>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Name" value={app.name} />
                    <Field label="Slug" value={app.slug} mono />
                    <Field label="Category" value={app.category ?? "—"} />
                    <Field label="Creator" value={app.creator_email ?? "—"} />
                    <Field
                      label="Tagline"
                      value={app.tagline ?? "—"}
                      colSpan={2}
                    />
                    <Field
                      label="Description"
                      value={app.description ?? "—"}
                      colSpan={2}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Admin Moderation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AgentAppAdminActions
                      app={app}
                      onUpdate={handleAdminUpdate}
                      onDelete={handleDelete}
                      showRateLimits
                      variant="inline"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Analytics</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <Stat
                      label="Runs"
                      value={(app.total_executions ?? 0).toLocaleString()}
                    />
                    <Stat
                      label="Users"
                      value={(app.unique_users_count ?? 0).toLocaleString()}
                    />
                    <Stat
                      label="Success"
                      value={`${((app.success_rate ?? 0) * 100).toFixed(0)}%`}
                    />
                    <Stat
                      label="Cost"
                      value={`$${(app.total_cost ?? 0).toFixed(4)}`}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Timestamps</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <Field
                      label="Created"
                      value={new Date(app.created_at).toLocaleString()}
                    />
                    <Field
                      label="Updated"
                      value={new Date(app.updated_at).toLocaleString()}
                    />
                    <Field
                      label="Published"
                      value={
                        app.published_at
                          ? new Date(app.published_at).toLocaleString()
                          : "—"
                      }
                    />
                    <Field
                      label="Last Execution"
                      value={
                        app.last_execution_at
                          ? new Date(app.last_execution_at).toLocaleString()
                          : "—"
                      }
                    />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="code"
            className="flex-1 overflow-hidden m-0 data-[state=active]:flex p-2"
          >
            <div className="flex-1 overflow-hidden">
              <AgentAppEditor
                app={toAgentApp(app)}
                onSave={handleSaveComponentCode}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <UpdateAgentAppModal
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
        app={toAgentApp(app)}
        onSubmit={handleSaveMetadata}
      />
    </div>
  );
}

function Field({
  label,
  value,
  colSpan = 1,
  mono = false,
}: {
  label: string;
  value: string;
  colSpan?: number;
  mono?: boolean;
}) {
  return (
    <div className={colSpan === 2 ? "col-span-2" : undefined}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"} text-foreground break-words`}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
