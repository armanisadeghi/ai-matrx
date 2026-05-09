"use client";

/**
 * AgentAppSettingsContent — /agent-apps/[id]/settings page body.
 *
 * Edits the configurable fields on `aga_apps`. All writes go through
 * saveAppField (per-field PATCH) or saveApp (batch). RLS handles ownership;
 * the SECURITY-related fields (is_featured, is_verified, rate_limit_*) are
 * intentionally not editable here — those live in the admin surface.
 *
 * Identity fields (name, tagline, description, category, tags) edit live
 * with debounced auto-save. Toggles (status, is_public) commit immediately.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Globe, Loader2, Lock, Save, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast-service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { siteConfig } from "@/config/extras/site";
import { AgentAppCategoryPicker } from "@/features/agent-apps/components/inputs/AgentAppCategoryPicker";
import { AgentAppTagsInput } from "@/features/agent-apps/components/inputs/AgentAppTagsInput";
import {
  SearchableAgentSelect,
  type AgentOption,
} from "@/features/agent-apps/components/SearchableAgentSelect";
import { AgentVersionPicker } from "@/features/agent-shortcuts/components/AgentVersionPicker";
import { selectAppById } from "@/features/agents/redux/agent-apps/selectors";
import {
  saveAppField,
  deleteApp,
} from "@/features/agents/redux/agent-apps/thunks";
import { selectLiveAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";
import type { AppStatus } from "@/features/agent-apps/types";

interface AgentAppSettingsContentProps {
  appId: string;
}

const STATUS_OPTIONS: { value: AppStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function AgentAppSettingsContent({
  appId,
}: AgentAppSettingsContentProps) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId));

  // Local mirrors for fields that benefit from explicit save
  // (avoid jank on every keystroke).
  const [name, setName] = useState(app?.name ?? "");
  const [tagline, setTagline] = useState(app?.tagline ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Local mirrors for fields with explicit save (paths, IDs, ints).
  const [organizationId, setOrganizationId] = useState(app?.organization_id ?? "");
  const [projectId, setProjectId] = useState(app?.project_id ?? "");
  const [taskId, setTaskId] = useState(app?.task_id ?? "");
  const [faviconUrl, setFaviconUrl] = useState(app?.favicon_url ?? "");
  const [previewImageUrl, setPreviewImageUrl] = useState(
    app?.preview_image_url ?? "",
  );
  const [rateIp, setRateIp] = useState<string>(
    String(app?.rate_limit_per_ip ?? ""),
  );
  const [rateWindow, setRateWindow] = useState<string>(
    String(app?.rate_limit_window_hours ?? ""),
  );
  const [rateAuth, setRateAuth] = useState<string>(
    String(app?.rate_limit_authenticated ?? ""),
  );

  // Hydrate the live agents list so the agent picker has options when the
  // user deep-links to /settings without going through /agent-apps first.
  useEffect(() => {
    dispatch(fetchAgentsList());
  }, [dispatch]);

  const liveAgents = useAppSelector(selectLiveAgents);
  const agentOptions: AgentOption[] = liveAgents
    .filter((a) => a.agentType === "user")
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? null,
      category: a.category ?? null,
    }));

  useEffect(() => {
    if (!app) return;
    setName(app.name);
    setTagline(app.tagline ?? "");
    setDescription(app.description ?? "");
    setOrganizationId(app.organization_id ?? "");
    setProjectId(app.project_id ?? "");
    setTaskId(app.task_id ?? "");
    setFaviconUrl(app.favicon_url ?? "");
    setPreviewImageUrl(app.preview_image_url ?? "");
    setRateIp(String(app.rate_limit_per_ip ?? ""));
    setRateWindow(String(app.rate_limit_window_hours ?? ""));
    setRateAuth(String(app.rate_limit_authenticated ?? ""));
  }, [app?.id]);

  const saveField = useCallback(
    async (field: string, value: unknown) => {
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
      } finally {
        setSavingField(null);
      }
    },
    [appId, dispatch],
  );

  const handleStatusChange = (value: AppStatus) => saveField("status", value);
  const handlePublicChange = (checked: boolean) =>
    saveField("is_public", checked);
  const handleCategoryChange = (next: string | null) =>
    saveField("category", next);
  const handleTagsChange = (next: string[]) => saveField("tags", next);
  const handleAgentChange = (nextAgentId: string) => {
    if (nextAgentId === app?.agent_id) return;
    saveField("agent_id", nextAgentId);
    // When the agent changes, the previously-pinned version no longer applies.
    // Clear the version pin and let the version picker pick the latest of the
    // new agent next render.
    saveField("agent_version_id", null);
  };
  const handleVersionChange = (next: string | null) =>
    saveField("agent_version_id", next);
  const handleUseLatestChange = (next: boolean) =>
    saveField("use_latest", next);

  const handleCopyUrl = async () => {
    if (!app) return;
    try {
      await navigator.clipboard.writeText(`${siteConfig.url}/p/${app.slug}`);
      setCopied(true);
      toast.success("Public URL copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    const ok = await confirm({
      title: "Delete agent app",
      description: `Permanently delete "${app.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await dispatch(deleteApp(app.id)).unwrap();
      toast.success("App deleted.");
      window.location.href = "/agent-apps";
    } catch (err) {
      toast.error(
        err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed.",
      );
      setIsDeleting(false);
    }
  };

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading settings…
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-3xl mx-auto px-4 pb-6 pt-4 space-y-5">
        {/* Identity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup
              label="Name"
              busy={savingField === "name"}
              onSave={() => saveField("name", name)}
              dirty={name !== app.name}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="App name"
                className="text-[16px]"
              />
            </FieldGroup>

            <FieldGroup
              label="Tagline"
              busy={savingField === "tagline"}
              onSave={() => saveField("tagline", tagline.trim() || null)}
              dirty={(tagline ?? "") !== (app.tagline ?? "")}
            >
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="One-line pitch"
                className="text-[16px]"
              />
            </FieldGroup>

            <FieldGroup
              label="Description"
              busy={savingField === "description"}
              onSave={() => saveField("description", description.trim() || null)}
              dirty={(description ?? "") !== (app.description ?? "")}
            >
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this app do?"
                className="text-[16px] min-h-24"
              />
            </FieldGroup>

            <div className="space-y-1.5">
              <Label className="text-sm">Category</Label>
              <AgentAppCategoryPicker
                value={app.category}
                onChange={handleCategoryChange}
                disabled={savingField === "category"}
              />
              <p className="text-xs text-muted-foreground">
                Pick a system category or type your own. Saves immediately.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Tags</Label>
              <AgentAppTagsInput
                value={Array.isArray(app.tags) ? app.tags : []}
                onChange={handleTagsChange}
                disabled={savingField === "tags"}
                placeholder="Add a tag and press Enter…"
              />
              <p className="text-xs text-muted-foreground">
                Press Enter or comma to add. Click X to remove. Saves
                immediately.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Agent binding */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Agent binding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Agent</Label>
              <SearchableAgentSelect
                agents={agentOptions}
                value={app.agent_id}
                onChange={handleAgentChange}
                placeholder="Search agents…"
                emptyLabel="No agents found in your library."
              />
              <p className="text-xs text-muted-foreground">
                Switching the agent clears the pinned version. The next save
                will repin to the new agent&apos;s latest version unless you
                opt into &ldquo;always use latest.&rdquo;
              </p>
            </div>
            <AgentVersionPicker
              agentId={app.agent_id}
              agentVersionId={app.agent_version_id}
              useLatest={app.use_latest}
              onAgentVersionIdChange={handleVersionChange}
              onUseLatestChange={handleUseLatestChange}
              disabled={
                savingField === "agent_id" ||
                savingField === "agent_version_id" ||
                savingField === "use_latest"
              }
            />
          </CardContent>
        </Card>

        {/* Scope (org / project / task) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Optional. Associates this app with an organization, project,
              and/or task. Many-to-many scope is on the roadmap; for now each
              field accepts a single UUID.
            </p>
            <FieldGroup
              label="Organization ID"
              busy={savingField === "organization_id"}
              dirty={(organizationId ?? "") !== (app.organization_id ?? "")}
              onSave={() =>
                saveField("organization_id", organizationId.trim() || null)
              }
            >
              <Input
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="UUID — leave empty for personal scope"
                className="text-[16px] font-mono text-xs"
              />
            </FieldGroup>
            <FieldGroup
              label="Project ID"
              busy={savingField === "project_id"}
              dirty={(projectId ?? "") !== (app.project_id ?? "")}
              onSave={() => saveField("project_id", projectId.trim() || null)}
            >
              <Input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="UUID — optional"
                className="text-[16px] font-mono text-xs"
              />
            </FieldGroup>
            <FieldGroup
              label="Task ID"
              busy={savingField === "task_id"}
              dirty={(taskId ?? "") !== (app.task_id ?? "")}
              onSave={() => saveField("task_id", taskId.trim() || null)}
            >
              <Input
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="UUID — optional"
                className="text-[16px] font-mono text-xs"
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {/* Rate limits */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rate limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Caps how often this app can run. Lowering values is always
              safe; raising above the admin cap will be rejected server-side.
            </p>
            <FieldGroup
              label="Per-IP / window"
              hint="Max guest runs from one IP per window."
              busy={savingField === "rate_limit_per_ip"}
              dirty={
                rateIp.trim() !== String(app.rate_limit_per_ip ?? "")
              }
              onSave={() => {
                const n = rateIp.trim() === "" ? null : Number(rateIp);
                if (n != null && (!Number.isFinite(n) || n < 0)) {
                  toast.error("Per-IP must be a non-negative integer.");
                  return;
                }
                saveField("rate_limit_per_ip", n);
              }}
            >
              <Input
                value={rateIp}
                onChange={(e) => setRateIp(e.target.value)}
                inputMode="numeric"
                placeholder="20"
                className="text-[16px]"
              />
            </FieldGroup>
            <FieldGroup
              label="Window (hours)"
              hint="The rolling window for the per-IP and authenticated caps."
              busy={savingField === "rate_limit_window_hours"}
              dirty={
                rateWindow.trim() !== String(app.rate_limit_window_hours ?? "")
              }
              onSave={() => {
                const n = rateWindow.trim() === "" ? null : Number(rateWindow);
                if (n != null && (!Number.isFinite(n) || n < 0)) {
                  toast.error("Window must be a non-negative integer.");
                  return;
                }
                saveField("rate_limit_window_hours", n);
              }}
            >
              <Input
                value={rateWindow}
                onChange={(e) => setRateWindow(e.target.value)}
                inputMode="numeric"
                placeholder="24"
                className="text-[16px]"
              />
            </FieldGroup>
            <FieldGroup
              label="Authenticated / window"
              hint="Max signed-in user runs per window."
              busy={savingField === "rate_limit_authenticated"}
              dirty={
                rateAuth.trim() !==
                String(app.rate_limit_authenticated ?? "")
              }
              onSave={() => {
                const n = rateAuth.trim() === "" ? null : Number(rateAuth);
                if (n != null && (!Number.isFinite(n) || n < 0)) {
                  toast.error("Authenticated must be a non-negative integer.");
                  return;
                }
                saveField("rate_limit_authenticated", n);
              }}
            >
              <Input
                value={rateAuth}
                onChange={(e) => setRateAuth(e.target.value)}
                inputMode="numeric"
                placeholder="100"
                className="text-[16px]"
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {/* Icons & preview image */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Icons & preview image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              URL fields for now — a proper upload flow with the file handler
              lands in Phase 5.
            </p>
            <FieldGroup
              label="Favicon URL"
              hint="Square image for browser tabs and small thumbnails."
              busy={savingField === "favicon_url"}
              dirty={(faviconUrl ?? "") !== (app.favicon_url ?? "")}
              onSave={() => saveField("favicon_url", faviconUrl.trim() || null)}
            >
              <Input
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                placeholder="https://…/icon.png"
                className="text-[16px]"
              />
            </FieldGroup>
            <FieldGroup
              label="Preview image URL"
              hint="Used by social cards (Open Graph)."
              busy={savingField === "preview_image_url"}
              dirty={
                (previewImageUrl ?? "") !== (app.preview_image_url ?? "")
              }
              onSave={() =>
                saveField("preview_image_url", previewImageUrl.trim() || null)
              }
            >
              <Input
                value={previewImageUrl}
                onChange={(e) => setPreviewImageUrl(e.target.value)}
                placeholder="https://…/preview.png"
                className="text-[16px]"
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {/* Public URL display (slug editing TBD — destructive, separate flow) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Public URL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/60">
              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
                {siteConfig.url}/p/
              </span>
              <span
                className="text-sm font-mono text-foreground truncate flex-1"
                title={app.slug}
              >
                {app.slug}
              </span>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Copy public URL"
                title="Copy"
              >
                <Copy className={copied ? "w-3.5 h-3.5 text-emerald-500" : "w-3.5 h-3.5"} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Changing the slug breaks every existing public link to this
              app. The slug is read-only here for now; we&apos;ll add a
              guarded rename flow in a follow-up.
            </p>
          </CardContent>
        </Card>

        {/* Status & visibility */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status & visibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Status</Label>
              <Select
                value={app.status}
                onValueChange={(v) => handleStatusChange(v as AppStatus)}
                disabled={savingField === "status"}
              >
                <SelectTrigger className="w-[200px] h-9" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {app.is_public ? (
                  <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <Label className="text-sm">Public</Label>
                  <p className="text-xs text-muted-foreground">
                    {app.is_public
                      ? "Anyone with the link can use this app."
                      : "Only you can use this app."}
                  </p>
                </div>
              </div>
              <Switch
                checked={app.is_public}
                onCheckedChange={handlePublicChange}
                disabled={savingField === "is_public"}
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">
              Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium text-foreground">Delete this app</p>
                <p className="text-xs text-muted-foreground">
                  Removes the app and all of its execution records.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete app
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Internal ─────────────────────────────────────────────────────────────────

interface FieldGroupProps {
  label: string;
  hint?: string;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
  children: React.ReactNode;
}

function FieldGroup({
  label,
  hint,
  busy,
  dirty,
  onSave,
  children,
}: FieldGroupProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={onSave}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            Save
          </Button>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
