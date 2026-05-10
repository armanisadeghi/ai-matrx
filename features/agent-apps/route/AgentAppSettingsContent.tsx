"use client";

/**
 * AgentAppSettingsContent — /agent-apps/[id]/settings page body.
 *
 * Tabbed surface. Each tab edits one coherent slice of `aga_apps`. Saves
 * are atomic per-field; no batch save button. The user knows what each
 * field is — there are no helper paragraphs, no warnings, no
 * explanations of what an agent or version is.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Save, Trash2 } from "lucide-react";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { toast } from "@/lib/toast-service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { siteConfig } from "@/config/extras/site";
import { AgentAppCategoryPicker } from "@/features/agent-apps/components/inputs/AgentAppCategoryPicker";
import { AgentAppTagsInput } from "@/features/agent-apps/components/inputs/AgentAppTagsInput";
import { AgentBindingCompact } from "@/features/agent-apps/components/inputs/AgentBindingCompact";
import { AgentVersionCompact } from "@/features/agent-apps/components/inputs/AgentVersionCompact";
import { AgentAppImageField } from "@/features/agent-apps/components/inputs/AgentAppImageField";
import { AgentAppHierarchyCascade } from "@/features/agent-apps/components/inputs/AgentAppHierarchyCascade";
import { selectAppById } from "@/features/agents/redux/agent-apps/selectors";
import {
  saveAppField,
  deleteApp,
} from "@/features/agents/redux/agent-apps/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
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
  const agent = useAppSelector((state) =>
    app?.agent_id ? selectAgentById(state, app.agent_id) : undefined,
  );

  const [name, setName] = useState(app?.name ?? "");
  const [tagline, setTagline] = useState(app?.tagline ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setTagline(app.tagline ?? "");
    setDescription(app.description ?? "");
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

  const handleAgentChange = (nextAgentId: string) => {
    if (!app || nextAgentId === app.agent_id) return;
    saveField("agent_id", nextAgentId);
    saveField("agent_version_id", null);
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

  const handleCopyUrl = async () => {
    if (!app) return;
    try {
      await navigator.clipboard.writeText(`${siteConfig.url}/p/${app.slug}`);
      toast.success("Public URL copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!app) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const publicUrl = `${siteConfig.url}/p/${app.slug}`;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-3xl mx-auto px-4 pb-10 pt-4">
        <Tabs defaultValue="identity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="identity">Identity</TabsTrigger>
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="sharing">Sharing</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          {/* ── Identity ───────────────────────────────────────────────── */}
          <TabsContent value="identity" className="space-y-5">
            <FieldRow
              label="Name"
              busy={savingField === "name"}
              dirty={name !== app.name}
              onSave={() => saveField("name", name)}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-[16px]"
              />
            </FieldRow>
            <FieldRow
              label="Tagline"
              busy={savingField === "tagline"}
              dirty={(tagline ?? "") !== (app.tagline ?? "")}
              onSave={() => saveField("tagline", tagline.trim() || null)}
            >
              <Input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="text-[16px]"
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
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-[16px] min-h-24"
              />
            </FieldRow>
            <Row label="Category">
              <AgentAppCategoryPicker
                value={app.category}
                onChange={(next) => saveField("category", next)}
                disabled={savingField === "category"}
              />
            </Row>
            <Row label="Tags">
              <AgentAppTagsInput
                value={Array.isArray(app.tags) ? app.tags : []}
                onChange={(next) => saveField("tags", next)}
                disabled={savingField === "tags"}
              />
            </Row>
          </TabsContent>

          {/* ── Agent ──────────────────────────────────────────────────── */}
          <TabsContent value="agent" className="space-y-3">
            <AgentBindingCompact
              agentId={app.agent_id}
              agentName={agent?.name}
              onChange={handleAgentChange}
              disabled={savingField === "agent_id"}
            />
            <AgentVersionCompact
              agentId={app.agent_id}
              agentVersionId={app.agent_version_id}
              useLatest={app.use_latest}
              onAgentVersionIdChange={(next) =>
                saveField("agent_version_id", next)
              }
              onUseLatestChange={(next) => saveField("use_latest", next)}
              disabled={
                savingField === "agent_version_id" ||
                savingField === "use_latest"
              }
            />
          </TabsContent>

          {/* ── Branding ───────────────────────────────────────────────── */}
          <TabsContent value="branding" className="space-y-5">
            <Row label="Icon">
              <AgentAppImageField
                value={app.favicon_url}
                onChange={(next) => saveField("favicon_url", next)}
                aspect="aspect-square"
                ariaLabel="Upload icon"
                disabled={savingField === "favicon_url"}
              />
            </Row>
            <Row label="Preview image">
              <AgentAppImageField
                value={app.preview_image_url}
                onChange={(next) => saveField("preview_image_url", next)}
                aspect="aspect-[1200/630]"
                ariaLabel="Upload preview image"
                disabled={savingField === "preview_image_url"}
              />
            </Row>
          </TabsContent>

          {/* ── Sharing (status + visibility + URL + scope + limits) ──── */}
          <TabsContent value="sharing" className="space-y-5">
            <Row label="Status">
              <Select
                value={app.status}
                onValueChange={(v) => saveField("status", v as AppStatus)}
                disabled={savingField === "status"}
              >
                <SelectTrigger className="h-8 w-[180px]" size="sm">
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
            </Row>
            <Row label="Public">
              <Switch
                checked={app.is_public}
                onCheckedChange={(v) => saveField("is_public", v)}
                disabled={savingField === "is_public"}
              />
            </Row>
            <Row label="Public URL">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/60">
                <span className="text-sm font-mono text-foreground truncate flex-1">
                  {publicUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                  aria-label="Copy"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </Row>

            <div className="border-t border-border/60 pt-4">
              <AgentAppHierarchyCascade
                appId={app.id}
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
                <Input
                  value={rateIp}
                  onChange={(e) => setRateIp(e.target.value)}
                  inputMode="numeric"
                  className="h-8 w-32 text-[16px]"
                />
              </FieldRow>
              <FieldRow
                label="Window (hrs)"
                busy={savingField === "rate_limit_window_hours"}
                dirty={
                  rateWindow.trim() !== String(app.rate_limit_window_hours ?? "")
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
                <Input
                  value={rateWindow}
                  onChange={(e) => setRateWindow(e.target.value)}
                  inputMode="numeric"
                  className="h-8 w-32 text-[16px]"
                />
              </FieldRow>
              <FieldRow
                label="Authenticated / window"
                busy={savingField === "rate_limit_authenticated"}
                dirty={
                  rateAuth.trim() !==
                  String(app.rate_limit_authenticated ?? "")
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
                <Input
                  value={rateAuth}
                  onChange={(e) => setRateAuth(e.target.value)}
                  inputMode="numeric"
                  className="h-8 w-32 text-[16px]"
                />
              </FieldRow>
            </div>
          </TabsContent>

          {/* ── Danger zone ────────────────────────────────────────────── */}
          <TabsContent value="danger">
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-destructive/30 bg-destructive/5">
              <span className="text-sm">Delete this app</span>
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
                Delete
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Internal layout primitives ───────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1"
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
    </div>
  );
}
