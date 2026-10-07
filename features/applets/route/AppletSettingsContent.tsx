"use client";

/**
 * AppletSettingsContent — /applets/manage/[id]/settings page body.
 *
 * Tabbed surface over the Applet record (`app.definition`, CONTRACTS §8):
 * Overview (identity, slug, images), Pages, Jobs, Sources, Sharing, Danger.
 * Identity fields save per field; pages/jobs/sources save as a whole column
 * through the version-guarded `saveAppletRecord`.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { PUBLISHED_TO_WEB_LABEL } from "@/lib/row-access";
import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Save, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { usePathname } from "next/navigation";
import { buildAppletsWorkspaceScope } from "./AppletSurfaceRuntime";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/lib/toast-service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import { useChangeByTalkingDisclosure } from "@/features/applets/route/useChangeByTalkingDisclosure";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { appletJobs, appletPages, appletSources } from "@/features/applets/types";
import {
  appletSettingsAgentPayload,
  appletSettingsHuman,
  type AppletFieldDraft,
  type AppletSaveBlocker,
  type AppletSettingsView,
} from "@/features/applets/format";
import { siteConfig } from "@/config/extras/site";
import { AppletCategoryPicker } from "@/features/applets/components/inputs/AppletCategoryPicker";
import { AppletTagsInput } from "@/features/applets/components/inputs/AppletTagsInput";
import {
  AppletJobsEditor,
  AppletPagesEditor,
  AppletSourcesEditor,
} from "./AppletRecordEditors";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { AppletImageField } from "@/features/applets/components/inputs/AppletImageField";
import { EntityEngagementPicker } from "@/features/scopes/components/active-context/engagement/EntityEngagementPicker";
import { EmbedSnippet } from "@/features/applets/components/builder/EmbedSnippet";
import { selectAppById } from "@/features/agents/redux/applets/selectors";
import {
  saveAppField,
  deleteApp,
  setAppletPublication,
} from "@/features/agents/redux/applets/thunks";
import { useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { APPLETS_SURFACE_NAME } from "@/features/surfaces/manifests/applets.manifest";
import { useDeclarePageObjectOrganization } from "@/features/shell/pageObjectOrganization";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  validateAppCategory,
  validateAppTags,
} from "./applet-entity-writes";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProInput } from "@/components/official/ProInput";

interface AppletSettingsContentProps {
  appId: string;
}

/**
 * Surface-write input guards. Both THROW rather than coercing — the writeback
 * seam converts a throw into the error envelope the agent reads, and a wrong
 * value is the agent's mistake to hear about, not ours to paper over.
 */
function requireString(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} must be a string; got ${value === null ? "null" : typeof value}.`,
    );
  }
  return value;
}

/**
 * Every write target on this surface edits the OPEN app. Until the Redux row
 * has hydrated there is nothing to write into, and staging text into a form
 * that is about to be re-initialised would silently lose it.
 */
function requireOpenApp(app: unknown, target: string): void {
  if (!app) {
    throw new Error(
      `Cannot apply ${target}: no Applet is open yet on this page. Wait for the app to load, or open an app at /applets/manage/[id]/settings first.`,
    );
  }
}

export function AppletSettingsContent({
  appId,
}: AppletSettingsContentProps) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const pathname = usePathname();
  const app = useAppSelector((state) => selectAppById(state, appId));

  // This is an OBJECT page: the app already knows its organization, so a red
  // "Choose org" over it would be a lie (GATES-TAIL, VERIFIER-23 #8 note (a)).
  const { organizations: myOrganizations } = useUserOrganizations();
  const appOrganizationId = app?.organization_id ?? null;
  useDeclarePageObjectOrganization(
    appOrganizationId
      ? {
          organizationId: appOrganizationId,
          name: myOrganizations.find((o) => o.id === appOrganizationId)?.name ?? null,
          shownByPage: false,
        }
      : null,
  );

  const [name, setName] = useState(app?.name ?? "");
  const [slug, setSlug] = useState(app?.slug ?? "");
  const [tagline, setTagline] = useState(app?.tagline ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Controlled so the copy payload can state WHICH slice of the form the user
  // is actually in — "what is the user doing here" is half the context.
  const [activeTab, setActiveTab] = useState("details");
  useChangeByTalkingDisclosure();

  const [rateIp, setRateIp] = useState<string>(
    String(app?.rate_limit_per_ip ?? ""),
  );
  const [rateWindow, setRateWindow] = useState<string>(
    String(app?.rate_limit_window_hours ?? ""),
  );
  const [rateAuth, setRateAuth] = useState<string>(
    String(app?.rate_limit_authenticated ?? ""),
  );

  useEffect(() => {
    if (!app) return;
    setName(app.name);
    setSlug(app.slug);
    setTagline(app.tagline ?? "");
    setDescription(app.description ?? "");
    setRateIp(String(app.rate_limit_per_ip ?? ""));
    setRateWindow(String(app.rate_limit_window_hours ?? ""));
    setRateAuth(String(app.rate_limit_authenticated ?? ""));
  }, [app?.id]);

  const saveField = useCallback(
    async (
      field: string,
      value: unknown,
      // A user click is fire-and-forget: it wants the toast and nothing else.
      // The surface write handlers below need the failure to propagate so the
      // writeback seam can hand the agent a real error instead of a silent OK.
      options?: { rethrow?: boolean },
    ) => {
      setSavingField(field);
      try {
        await dispatch(
          saveAppField({
            appId,
            field: field as Parameters<typeof saveAppField>[0]["field"],
            value: value as Parameters<typeof saveAppField>[0]["value"],
          }),
        ).unwrap();
        toast.success("Saved.");
      } catch (err) {
        toast.error(
          err instanceof Error ? `Save failed: ${err.message}` : "Save failed.",
        );
        if (options?.rethrow) throw err;
      } finally {
        setSavingField(null);
      }
    },
    [appId, dispatch],
  );

  // ── Surface write targets (matrx-user/agent-apps) ──────────────────────
  // The five Identity fields the manifest declares agent-writable. The
  // provider is mounted a level up in AppletSurfaceRuntime (the [id]
  // layout); this component owns the local input state and the saveField
  // wrapper, so the handlers register from here and route through exactly
  // what the user's own typing and clicks use — never a parallel write.
  //
  // name / tagline / description are `draft`: they set the same local state
  // the inputs are bound to, which lights up that field's dirty marker and
  // Save button for the user to confirm. category / tags are `entity`: their
  // pickers have no staging step, so these commit through saveAppField just
  // as picking a value by hand does.
  //
  // Every handler throws on a bad shape or a missing app — the writeback
  // runtime turns a throw into the loud, captured error envelope the agent
  // reads back. Nothing is coerced into shape silently.
  useSurfaceWriteHandlers(APPLETS_SURFACE_NAME, {
    app_name: (value) => {
      requireOpenApp(app, "app_name");
      const next = requireString(value, "app_name");
      if (!next.trim()) {
        throw new Error(
          "app_name must be a non-empty string — an app cannot be left unnamed.",
        );
      }
      setName(next);
    },
    app_tagline: (value) => {
      requireOpenApp(app, "app_tagline");
      setTagline(requireString(value, "app_tagline"));
    },
    app_description: (value) => {
      requireOpenApp(app, "app_description");
      setDescription(requireString(value, "app_description"));
    },
    // The two ENTITY targets share their validators with the layout mount
    // (applet-entity-writes.ts), which registers the same pair so category
    // and tags are writable from the other sub-routes too — an entity write
    // needs the row, not this tab's inputs. When Settings IS open these
    // registered handlers shadow the layout's, so the write still goes
    // through the `saveField` wrapper the pickers themselves call.
    app_category: async (value) => {
      requireOpenApp(app, "app_category");
      await saveField("category", validateAppCategory(value), {
        rethrow: true,
      });
    },
    app_tags: async (value) => {
      requireOpenApp(app, "app_tags");
      await saveField("tags", validateAppTags(value), { rethrow: true });
    },
  });

  const handleDelete = async () => {
    if (!app) return;
    const ok = await confirm({
      title: `Archive "${app.name}"?`,
      // The owner restores it from the Applets list (Filters → Archived) or Trash.
      description: `${archiveConfirmSentence(`"${app.name}"`, { restoreFrom: "list_filters" })} It stops running for everyone.`,
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await dispatch(deleteApp(app.id)).unwrap();
      toast.success("Applet archived.");
      window.location.href = "/applets";
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Archive failed: ${err.message}`
          : "Archive failed.",
      );
      setIsDeleting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!app) return;
    await copyText(`${siteConfig.url}/applets/${app.slug}`, "Link copied");
  };

  const handlePublicationChange = async (published: boolean) => {
    setSavingField("publication");
    try {
      await dispatch(setAppletPublication({ appId, published })).unwrap();
      toast.success(published ? "App published." : "App unpublished.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Publication failed: ${error.message}`
          : "Publication failed.",
      );
    } finally {
      setSavingField(null);
    }
  };

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const publicUrl = `${siteConfig.url}/applets/${app.slug}`;

  // ── Copy-for-AI: the form as it stands RIGHT NOW ────────────────────────
  // Built inside the click handler (CopyButtons resolves these lazily) so the
  // payload is the LIVE inputs, never the fetched row. Copying `app.tagline`
  // after the user retyped the tagline would hand the agent a value that is
  // on nobody's screen. The three staged text fields and the three rate-limit
  // fields have a draft layer; everything else on this page commits on change,
  // so its rendered value IS the saved value (reported separately, as such).
  const buildSettingsView = (): AppletSettingsView => {
    // `saved` mirrors each FieldRow's own `dirty` predicate exactly, so the
    // unsaved diff matches the Save buttons the user can see.
    const drafts: AppletFieldDraft[] = [
      { field: "name", label: "Name", live: name, saved: app.name },
      { field: "slug", label: "Slug", live: slug, saved: app.slug },
      {
        field: "tagline",
        label: "Tagline",
        live: tagline ?? "",
        saved: app.tagline ?? "",
      },
      {
        field: "description",
        label: "Description",
        live: description ?? "",
        saved: app.description ?? "",
      },
      {
        field: "rate_limit_per_ip",
        label: "Per-IP / window",
        live: rateIp.trim(),
        saved: String(app.rate_limit_per_ip ?? ""),
      },
      {
        field: "rate_limit_window_hours",
        label: "Window (hrs)",
        live: rateWindow.trim(),
        saved: String(app.rate_limit_window_hours ?? ""),
      },
      {
        field: "rate_limit_authenticated",
        label: "Authenticated / window",
        live: rateAuth.trim(),
        saved: String(app.rate_limit_authenticated ?? ""),
      },
    ];

    // The only validation this page renders. The message is copied verbatim
    // from the toast the Save handlers fire, so the agent reads the same
    // sentence the user does.
    const saveBlockers: AppletSaveBlocker[] = drafts
      .filter((draft) => draft.field.startsWith("rate_limit_"))
      .filter((draft) => {
        if (draft.live === "") return false;
        const n = Number(draft.live);
        return !Number.isFinite(n) || n < 0;
      })
      .map((draft) => ({
        field: draft.field,
        label: draft.label,
        message: "Must be a non-negative integer.",
      }));

    return {
      app,
      activeTab,
      drafts,
      savingField,
      saveBlockers,
      committed: {
        category: app.category,
        tags: Array.isArray(app.tags) ? app.tags : [],
        jobs: appletJobs(app),
        pages: appletPages(app),
        sources: appletSources(app),
        favicon_url: app.favicon_url,
        preview_image_url: app.preview_image_url,
        status: app.status,
        published_to_web: app.published_to_web,
        organization_id: app.organization_id,
        project_id: app.project_id,
        task_id: app.task_id,
      },
      publicUrl,
    };
  };

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-3xl mx-auto px-4 pb-10 pt-4">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="sharing">Sharing</TabsTrigger>
              <TabsTrigger value="danger">Danger</TabsTrigger>
            </TabsList>
            <CopyButtons
              size="sm"
              label={`${app.name} settings`}
              human={() => appletSettingsHuman(buildSettingsView())}
              json={() => app}
              agent={() => appletSettingsAgentPayload(buildSettingsView())}
              agentVariant={{
                label: "This form",
                hint: "Live input values, unsaved diff, and any blocked saves",
                position: "first",
              }}
              aiVariants={[
                {
                  id: "unsaved",
                  label: "Unsaved changes only",
                  hint: "Just what differs from the saved record",
                  build: () => {
                    const view = buildSettingsView();
                    const changed = view.drafts.filter(
                      (draft) => draft.live !== draft.saved,
                    );
                    return appletSettingsAgentPayload({
                      ...view,
                      drafts: changed,
                    });
                  },
                },
              ]}
            />
          </div>

          {/* ── Details (never "Overview": that is the header's first mode) ── */}
          <TabsContent value="details" className="space-y-5">
            <FieldRow
              label="Name"
              busy={savingField === "name"}
              dirty={name !== app.name}
              onSave={() => saveField("name", name)}
            >
              <ProInput
                aria-label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldRow>
            <FieldRow
              label="Slug"
              busy={savingField === "slug"}
              dirty={slug !== app.slug}
              onSave={() => {
                const next = slug.trim().toLowerCase();
                if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) {
                  toast.error("Use lowercase letters, digits and dashes.");
                  return;
                }
                saveField("slug", next);
              }}
            >
              {/* ui-exception: a slug is a raw URL value, not prose — no voice or AI rewrite */}
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </FieldRow>
            <FieldRow
              label="Tagline"
              busy={savingField === "tagline"}
              dirty={(tagline ?? "") !== (app.tagline ?? "")}
              onSave={() => saveField("tagline", tagline.trim() || null)}
            >
              <ProInput
                aria-label="Tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </FieldRow>
            <FieldRow
              label="Description"
              busy={savingField === "description"}
              dirty={(description ?? "") !== (app.description ?? "")}
              onSave={() =>
                saveField("description", description.trim() || null)
              }
            >
              <ProTextarea
                aria-label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-[16px] min-h-24"
                surfaceName={APPLETS_SURFACE_NAME}
                getApplicationScope={() =>
                  buildAppletsWorkspaceScope(store.getState(), pathname)
                }
              />
            </FieldRow>
            <Row label="Category">
              <AppletCategoryPicker
                value={app.category}
                onChange={(next) => saveField("category", next)}
                disabled={savingField === "category"}
              />
            </Row>
            <Row label="Tags">
              <AppletTagsInput
                value={Array.isArray(app.tags) ? app.tags : []}
                onChange={(next) => saveField("tags", next)}
                disabled={savingField === "tags"}
              />
            </Row>
            <Row label="Icon">
              <AppletImageField
                value={app.favicon_url}
                onChange={(next) => saveField("favicon_url", next)}
                aspect="aspect-square"
                ariaLabel="Upload icon"
                disabled={savingField === "favicon_url"}
              />
            </Row>
            <Row label="Preview image">
              <AppletImageField
                value={app.preview_image_url}
                onChange={(next) => saveField("preview_image_url", next)}
                aspect="aspect-[1200/630]"
                ariaLabel="Upload preview image"
                disabled={savingField === "preview_image_url"}
              />
            </Row>
            <Button variant="outline" icon={<MessageSquare />} asChild>
              <Link href={`/applets/build?applet=${app.id}`}>Change it by talking</Link>
            </Button>
          </TabsContent>

          <TabsContent value="pages">
            <AppletPagesEditor app={app} />
          </TabsContent>

          <TabsContent value="jobs">
            <AppletJobsEditor app={app} />
          </TabsContent>

          <TabsContent value="sources">
            <AppletSourcesEditor app={app} />
          </TabsContent>

          {/* ── Sharing (publication + URL + scope + limits) ─────────── */}
          <TabsContent value="sharing" className="space-y-5">
            <Row label={PUBLISHED_TO_WEB_LABEL}>
              <Switch
                checked={app.status === "published" && app.published_to_web}
                onCheckedChange={handlePublicationChange}
                disabled={savingField === "publication"}
              />
            </Row>
            <Row label="Web address">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/60">
                {app.status === "published" && app.published_to_web ? (
                  <>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono text-foreground hover:underline truncate flex-1"
                    >
                      {publicUrl}
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                      aria-label="Copy the web address"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Publish to turn on the public link.
                  </span>
                )}
              </div>
            </Row>

            <div className="border-t border-border/60 pt-4">
              <EmbedSnippet slug={app.slug} />
            </div>

            <div className="border-t border-border/60 pt-4 space-y-1.5">
              <div className="text-sm font-medium text-foreground">
                Organization, project, task and scope tags
              </div>
              <EntityEngagementPicker
                // Applets live in app.definition (registry token `app`).
                entityType="app"
                entityId={app.id}
                organizationId={app.organization_id}
                projectId={app.project_id}
                taskId={app.task_id}
                onOrganizationChange={(next) =>
                  saveField("organization_id", next)
                }
                onProjectChange={(next) => saveField("project_id", next)}
                onTaskChange={(next) => saveField("task_id", next)}
                disabled={
                  savingField === "organization_id" ||
                  savingField === "project_id" ||
                  savingField === "task_id"
                }
              />
            </div>

            <div className="border-t border-border/60 pt-4 space-y-3">
              <FieldRow
                label="Per-IP / window"
                busy={savingField === "rate_limit_per_ip"}
                dirty={rateIp.trim() !== String(app.rate_limit_per_ip ?? "")}
                onSave={() => {
                  const n = rateIp.trim() === "" ? null : Number(rateIp);
                  if (n != null && (!Number.isFinite(n) || n < 0)) {
                    toast.error("Must be a non-negative integer.");
                    return;
                  }
                  saveField("rate_limit_per_ip", n);
                }}
              >
                {/* ui-exception: a numeric limit, not prose */}
                <Input
                  value={rateIp}
                  onChange={(e) => setRateIp(e.target.value)}
                  inputMode="numeric"
                  className="w-32"
                />
              </FieldRow>
              <FieldRow
                label="Window (hrs)"
                busy={savingField === "rate_limit_window_hours"}
                dirty={
                  rateWindow.trim() !==
                  String(app.rate_limit_window_hours ?? "")
                }
                onSave={() => {
                  const n =
                    rateWindow.trim() === "" ? null : Number(rateWindow);
                  if (n != null && (!Number.isFinite(n) || n < 0)) {
                    toast.error("Must be a non-negative integer.");
                    return;
                  }
                  saveField("rate_limit_window_hours", n);
                }}
              >
                {/* ui-exception: a numeric limit, not prose */}
                <Input
                  value={rateWindow}
                  onChange={(e) => setRateWindow(e.target.value)}
                  inputMode="numeric"
                  className="w-32"
                />
              </FieldRow>
              <FieldRow
                label="Authenticated / window"
                busy={savingField === "rate_limit_authenticated"}
                dirty={
                  rateAuth.trim() !== String(app.rate_limit_authenticated ?? "")
                }
                onSave={() => {
                  const n = rateAuth.trim() === "" ? null : Number(rateAuth);
                  if (n != null && (!Number.isFinite(n) || n < 0)) {
                    toast.error("Must be a non-negative integer.");
                    return;
                  }
                  saveField("rate_limit_authenticated", n);
                }}
              >
                {/* ui-exception: a numeric limit, not prose */}
                <Input
                  value={rateAuth}
                  onChange={(e) => setRateAuth(e.target.value)}
                  inputMode="numeric"
                  className="w-32"
                />
              </FieldRow>
            </div>
          </TabsContent>

          {/* ── Danger zone ────────────────────────────────────────────── */}
          <TabsContent value="danger">
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-destructive/30 bg-destructive/5">
              <span className="text-sm">Archive this Applet</span>
              <Button
                icon={isDeleting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                variant="danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                Archive
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Internal layout primitives ───────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <Label className="pt-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div>{children}</div>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  children: React.ReactNode;
}

function FieldRow({ label, busy, dirty, onSave, children }: FieldRowProps) {
  return (
    <div className="grid grid-cols-[140px_1fr_auto] items-start gap-3">
      <Label className="pt-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div>{children}</div>
      <div className="pt-1">
        {dirty && (
          <Button
            icon={busy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save />
            )}
            type="button"
            variant="quiet"
            onClick={onSave}
            disabled={busy}
          >
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
