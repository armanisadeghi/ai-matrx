"use client";

import React, {
  use,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { ReadFailure } from "@ai-matrx/design-system";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Pencil } from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  appletAdminEditAgentPayload,
  appletAdminEditHuman,
  appletAdminKpis,
  type AppletAdminEditView,
} from "@/features/applets/format";
import { formatCount, formatPercentFromFraction } from "@ai-matrx/kit/format";
import { useAdminCost } from "@/components/cost/useAdminCost";
import { AppletAdminActions } from "@/features/applets/components/AppletAdminActions";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { UpdateAppletModal } from "@/features/applets/components/UpdateAppletModal";
import type { AppletRow, UpdateAppletInput } from "@/features/applets/types";
import type {
  AppletAdminView,
  UpdateAppletAdminInput,
} from "@/lib/services/applets-admin-service";
import {
  fetchAppletCategories,
  getAppletById,
  updateAppletAdmin,
} from "@/lib/services/applets-admin-service";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLETS_SURFACE_NAME,
  createAdminAppletsScope,
} from "@/features/surfaces/manifests/admin-applets.manifest";
import {
  validateAppletCategoryWrite,
  validateAppletMetadataWrite,
} from "@/features/applets/lib/admin-app-write-targets";
// `app.definition.tags` has ONE contract; the user-facing surface owns it.
import { validateAppTags } from "@/features/applets/route/applet-entity-writes";
import { pushAppHref } from "@/lib/deployment/navigate";
import { usePointsRate } from "@/components/cost/pointsRate.client";

// `AppletAdminView` is a hand-narrowed subset of the real DB row used by the
// list/analytics surfaces (no component_code/variable_schema/shell_* fields).
// `getAppletById()` (and the PATCH route below) actually `select("*")` from
// `app.definition` (see `Database["app"]["Tables"]["definition"]["Row"]`), so
// at runtime every AppletRow-only field the editor reads (component_code,
// variable_schema, layout_config, shell_kind, etc.) IS present on `row` even
// though the declared `AppletAdminView` view type omits it.
function toApplet(row: AppletAdminView): AppletRow {
  return row as unknown as AppletRow;
}

/**
 * `UpdateAppletInput` types the optional copy fields as `string`, but the
 * columns are nullable and `null` is how the metadata write target CLEARS a
 * tagline or description (an empty string would leave an empty-string row).
 * The PATCH route passes the body straight to `.update()`, so widen the save
 * signature instead of casting the null away at each callsite.
 */
type AppletMetadataSave = Omit<
  UpdateAppletInput,
  "tagline" | "description"
> & {
  tagline?: string | null;
  description?: string | null;
};

export default function AdminEditAppletPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const formatCostDisplay = useAdminCost();
  const costRate = usePointsRate();
  const [isPending, startTransition] = useTransition();

  const [app, setApp] = useState<AppletAdminView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // A failed read is not "not found": it is said as a failure, with a retry.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"admin" | "code">("admin");
  // The system category vocabulary (platform.categories, dimension='app').
  // Published to the surface as `available_app_categories` AND used as the
  // allow-list the `app_category` write target validates against, so the list
  // an agent is told about and the list the handler accepts cannot drift.
  const [categoryNames, setCategoryNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    try {
      const data = await getAppletById(id);
      if (!data) {
        setNotFound(true);
        setApp(null);
      } else {
        setApp(data);
      }
    } catch (err) {
      setLoadError(err ?? new Error("Failed to load Applet"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchAppletCategories()
      .then((rows) => {
        if (!cancelled) setCategoryNames(rows.map((r) => r.name));
      })
      .catch(() => {
        // Non-fatal: the page still edits fine. `available_app_categories`
        // stays empty and the app_category write target throws a "not loaded"
        // error rather than accepting an unvalidated value.
        if (!cancelled) setCategoryNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goToList = () => {
    startTransition(() => {
      pushAppHref(router, "/administration/applets/all");
    });
  };

  const handleAdminUpdate = async (
    patch: Partial<UpdateAppletAdminInput>,
  ) => {
    if (!app) return;
    try {
      const updated = await updateAppletAdmin({ id: app.id, ...patch });
      setApp(updated);
      toast({ title: "Updated", description: "Admin settings saved" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to update Applet",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    try {
      const res = await fetch(`/api/applets/${app.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Move to Trash failed");
      }
      toast({ title: "Moved to Trash", description: `${app.name} can be restored from Trash` });
      goToList();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to move Applet to Trash",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleSaveMetadata = async (
    appId: string,
    input: AppletMetadataSave,
  ) => {
    try {
      const res = await fetch(`/api/applets/${appId}`, {
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
        prev ? { ...prev, ...(saved as AppletAdminView) } : prev,
      );
      toast({ title: "Saved", description: "Applet metadata updated" });
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

  /**
   * Write handlers for `matrx-admin/agent-apps` — registered ONLY here. Six
   * other components mount this surface and register nothing (see the
   * manifest's `writeTargets` block for the per-mount reasoning), so
   * `listAgentWritableTargets()` offers these three targets on the edit shell
   * and no tool at all on the list, analytics, executions, categories,
   * dashboard and rate-limit mounts.
   *
   * `mode: "entity"` — this page has no draft layer to stage into, so each
   * handler lands through `handleSaveMetadata`, the exact PATCH the metadata
   * modal's Save button calls. Validation lives in the pure
   * `admin-app-write-targets` core and THROWS; the writeback seam turns that
   * into the error envelope the agent reads. `handleAdminUpdate`
   * (status / featured / verified / public / rate limits) has no handler by
   * design — that is governance, not authored copy.
   */
  const buildWriteHandlers = (): SurfaceWriteHandlers => {
    if (!app) return {};
    return {
      app_metadata: async (value: unknown) => {
        await handleSaveMetadata(app.id, validateAppletMetadataWrite(value));
      },
      app_category: async (value: unknown) => {
        const category = validateAppletCategoryWrite(value, categoryNames);
        await handleSaveMetadata(app.id, { category });
      },
      app_tags: async (value: unknown) => {
        await handleSaveMetadata(app.id, { tags: validateAppTags(value) });
      },
    };
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center bg-textured">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Applet...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center p-6 bg-textured">
        <ReadFailure
          error={loadError}
          what="this Applet"
          onRetry={() => void load()}
          size="default"
        />
      </div>
    );
  }

  if (notFound || !app) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center p-6 bg-textured">
        <AccessGate
          token="app"
          id={id}
          onRetry={() => void load()}
          fallbackHref="/administration/applets/all"
          fallbackLabel="All Applets"
        />
      </div>
    );
  }

  // ── Copy-for-AI: this page as rendered ──────────────────────────────────
  // Resolved at click time. The Metadata / Analytics / Timestamps cards read
  // the fetched row directly — there is no page-level draft layer, so these
  // values honestly ARE what is on screen. The two draft layers on this page
  // (the metadata dialog and the inline rate-limit editor) own their own
  // live-state copy controls; this payload records whether either is open so
  // the agent is never told a stale number is the whole story.
  const buildAdminEditView = (): AppletAdminEditView => ({
    app,
    rate: costRate,
    activeTab,
    metadataModalOpen: metadataOpen,
    metadata: {
      name: app.name,
      slug: app.slug,
      category: app.category ?? null,
      creator: app.creator_email ?? null,
      tagline: app.tagline ?? null,
      description: app.description ?? null,
      tags: app.tags ?? [],
    },
    moderation: {
      status: app.status,
      published_to_web: app.published_to_web,
      is_featured: app.is_featured,
      is_verified: app.is_verified,
      rate_limit_per_ip: app.rate_limit_per_ip,
      rate_limit_window_hours: app.rate_limit_window_hours,
      rate_limit_authenticated: app.rate_limit_authenticated,
    },
    // Mirrors the Timestamps card's own toLocaleString rendering.
    timestamps: {
      created: new Date(app.created_at).toLocaleString(),
      updated: new Date(app.updated_at).toLocaleString(),
      published: app.published_at
        ? new Date(app.published_at).toLocaleString()
        : "—",
      last_execution: app.last_execution_at
        ? new Date(app.last_execution_at).toLocaleString()
        : "—",
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLETS_SURFACE_NAME}
      getScope={() =>
        createAdminAppletsScope({
          admin_section: "edit",
          selected_app_id: app.id,
          selected_app_summary: {
            name: app.name,
            slug: app.slug,
            category: app.category ?? null,
            creator_email: app.creator_email ?? null,
            tagline: app.tagline ?? null,
            description: app.description ?? null,
            tags: app.tags ?? [],
            status: app.status,
          },
          available_app_categories: categoryNames,
          selected_app_analytics: {
            total_executions: app.total_executions ?? null,
            unique_users_count: app.unique_users_count ?? null,
            success_rate: app.success_rate ?? null,
            total_cost: app.total_cost ?? null,
          },
          selected_app_tab: activeTab,
          selected_app_timestamps: {
            created_at: app.created_at,
            updated_at: app.updated_at,
            published_at: app.published_at ?? null,
            last_execution_at: app.last_execution_at ?? null,
          },
        })
      }
      getWriteHandlers={buildWriteHandlers}
    >
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 px-4 h-12 border-b border-border bg-card flex items-center gap-2">
        <Button
          icon={isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ArrowLeft />
          )}
          variant="quiet"
          onClick={goToList}
          disabled={isPending}
          className="-ml-2"
        >
          Back
        </Button>
        <div className="text-sm text-muted-foreground truncate flex items-center gap-2">
          Editing{" "}
          <span className="font-medium text-foreground">{app.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {app.status}
          </Badge>
          <a
            href={`/applets/${app.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
          >
            /applets/{app.slug}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="ml-auto flex-shrink-0">
          <CopyButtons
            size="sm"
            label={`${app.name} (admin edit)`}
            human={() => appletAdminEditHuman(buildAdminEditView())}
            json={() => app}
            agent={() => appletAdminEditAgentPayload(buildAdminEditView())}
            agentVariant={{
              label: "This page",
              hint: "Metadata, moderation, analytics KPIs and timestamps as shown",
              position: "first",
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "admin" | "code")}
          className="h-full flex flex-col"
        >
          <div className="border-b border-border px-4 bg-card">
            <TabsList >
              <TabsTrigger
                value="admin"
              >
                Admin Controls
              </TabsTrigger>
              <TabsTrigger
                value="code"
              >
                Preview
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
                      icon={<Pencil />}
                      variant="outline"
                      onClick={() => setMetadataOpen(true)}
                    >
                      Edit name / tagline
                    </Button>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Name" value={app.name} />
                    <Field label="Slug" value={app.slug} mono />
                    <Field label="Category" value={app.category ?? "—"} />
                    <Field label="Creator" value={app.creator_email ?? "—"} />
                                        <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">
                        Jobs
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-xs text-foreground break-words">
                        {app.job_keys.length > 0
                          ? app.job_keys.map((key) => (
                              <AppLink
                                key={key}
                                href={`/mandates/${encodeURIComponent(key)}`}
                                className="hover:underline"
                              >
                                {key}
                              </AppLink>
                            ))
                          : "—"}
                      </div>
                    </div>
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
                    <Field
                      label="Tags"
                      value={
                        app.tags?.length ? app.tags.join(", ") : "—"
                      }
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
                    <AppletAdminActions
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
                      value={formatCount(app.total_executions)}
                    />
                    <Stat
                      label="Users"
                      value={formatCount(app.unique_users_count)}
                    />
                    <Stat
                      label="Success"
                      value={formatPercentFromFraction(app.success_rate)}
                    />
                    <Stat
                      label="Cost"
                      value={formatCostDisplay(app.total_cost)}
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
            <div className="flex-1 overflow-auto">
              <AppletHostMount appletId={app.id} slug={app.slug} preview={{}} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <UpdateAppletModal
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
        app={toApplet(app)}
        onSubmit={handleSaveMetadata}
        kpis={appletAdminKpis(app, costRate)}
      />
    </div>
    </SurfaceRuntimeProvider>
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
