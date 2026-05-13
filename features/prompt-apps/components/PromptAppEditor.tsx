"use client";

import { useState, useEffect, lazy, Suspense, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ExternalLink,
  Eye,
  Trash2,
  ArrowLeft,
  Save,
  Play,
  Code2,
  Rocket,
  Loader2,
  TrendingUp,
  Users,
  Activity,
  Clock,
  BarChart3,
  Wand2,
  Copy,
  Check,
  Image,
  AlertCircle,
  ArrowDownToLine,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/utils/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast-service";
import { SmartCodeEditorModal } from "@/features/code-editor/agent-code-editor/components/SmartCodeEditorModal";
import { PROMPT_APP_AGENT_PICKER } from "@/features/code-editor/agent-code-editor/agents";
import type { PromptApp } from "../types/promptAppTypes";
import { cn } from "@/lib/utils";
import { PromptAppHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { UpdatePromptAppModal } from "./UpdatePromptAppModal";
import { useOpenImageUploaderWindow } from "@/features/window-panels/windows/image/useOpenImageUploaderWindow";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { InlineMediaRef } from "@/features/files";

// Lazy-load CodeBlock to avoid circular dependency with Providers
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

interface PromptAppEditorProps {
  app: PromptApp;
}

type EditorMode = "view" | "edit" | "run";

function PromptIdCopyBadge({ promptId }: { promptId: string }) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const shortId = promptId.slice(0, 8) + "...";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptId);
      setCopied(true);
      toast.success("Prompt ID copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-xs",
        "bg-muted/60 border border-border/50 text-muted-foreground",
        "hover:bg-primary/10 hover:border-primary/30 hover:text-primary",
        "transition-all duration-200 cursor-pointer group max-w-full",
      )}
      title="Click to copy prompt ID"
    >
      <span
        className={cn(
          "transition-all duration-200 truncate",
          isHovered ? "max-w-[22rem]" : "max-w-[5.5rem]",
        )}
      >
        {isHovered ? promptId : shortId}
      </span>
      {copied ? (
        <Check className="w-3 h-3 text-green-500 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

export function PromptAppEditor({ app: initialApp }: PromptAppEditorProps) {
  const router = useRouter();

  const [app, setApp] = useState(initialApp);
  const [mode, setMode] = useState<EditorMode>("view");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAIEditor, setShowAIEditor] = useState(false);

  // Editable fields
  const [editName, setEditName] = useState(app.name);
  const [editSlug, setEditSlug] = useState(app.slug);
  const [editTagline, setEditTagline] = useState(app.tagline || "");
  const [editDescription, setEditDescription] = useState(app.description || "");
  const [editComponentCode, setEditComponentCode] = useState(
    app.component_code,
  );
  const [editTags, setEditTags] = useState(app.tags.join(", "));
  const [editRateLimitPerIp, setEditRateLimitPerIp] = useState(
    app.rate_limit_per_ip.toString(),
  );
  const [editRateLimitWindowHours, setEditRateLimitWindowHours] = useState(
    app.rate_limit_window_hours.toString(),
  );
  const [editRateLimitAuthenticated, setEditRateLimitAuthenticated] = useState(
    app.rate_limit_authenticated.toString(),
  );
  const [editFaviconUrl, setEditFaviconUrl] = useState(app.favicon_url || "");
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const [promptName, setPromptName] = useState<string | null>(null);
  const [promptUpdatedAt, setPromptUpdatedAt] = useState<string | null>(null);
  const [isPromptStale, setIsPromptStale] = useState(false);
  const [isUpdatePromptModalOpen, setIsUpdatePromptModalOpen] = useState(false);
  const openImageUploader = useOpenImageUploaderWindow();

  const handleUploadFavicon = () => {
    openImageUploader({
      preset: "favicon",
      title: "Upload app icon",
      description:
        "Drop a square image — we'll generate the 192×192 and 64×64 variants.",
      currentUrl: editFaviconUrl || null,
      folder: CloudFolders.PROMPT_APPS_FAVICONS,
      onUploaded: (e) => {
        setEditFaviconUrl(e.result.primary_url);
      },
      onCleared: () => {
        setEditFaviconUrl("");
      },
    });
  };


  // Fetch the prompt name and check if prompt has been updated since app was last saved
  useEffect(() => {
    if (!app.prompt_id) return;

    const fetchPromptInfo = async () => {
      const { data, error } = await supabase
        .from("prompts")
        .select("name, updated_at")
        .eq("id", app.prompt_id)
        .single();

      if (!error && data) {
        setPromptName(data.name);
        setPromptUpdatedAt(data.updated_at);

        // Check if the prompt was updated after the app was last updated
        if (data.updated_at && app.updated_at) {
          const promptTime = new Date(data.updated_at).getTime();
          const appTime = new Date(app.updated_at).getTime();
          setIsPromptStale(promptTime > appTime);
        }
      }
    };

    fetchPromptInfo();
  }, [app.prompt_id, app.updated_at]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const tagsArray = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("prompt_apps")
        .update({
          name: editName,
          slug: editSlug,
          tagline: editTagline || null,
          description: editDescription || null,
          component_code: editComponentCode,
          tags: tagsArray,
          favicon_url: editFaviconUrl || null,
          rate_limit_per_ip: parseInt(editRateLimitPerIp),
          rate_limit_window_hours: parseInt(editRateLimitWindowHours),
          rate_limit_authenticated: parseInt(editRateLimitAuthenticated),
        })
        .eq("id", app.id);

      if (error) {
        toast.error("Failed to save changes: " + error.message);
        return;
      }

      // Update local state
      const updatedApp = {
        ...app,
        name: editName,
        slug: editSlug,
        tagline: editTagline || undefined,
        description: editDescription || undefined,
        component_code: editComponentCode,
        tags: tagsArray,
        rate_limit_per_ip: parseInt(editRateLimitPerIp),
        rate_limit_window_hours: parseInt(editRateLimitWindowHours),
        rate_limit_authenticated: parseInt(editRateLimitAuthenticated),
      };
      setApp(updatedApp);

      toast.success("Changes saved successfully!");
      setMode("view");
      router.refresh();
    } catch (error) {
      toast.error("Failed to save changes");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    const { error } = await supabase
      .from("prompt_apps")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", app.id);

    if (error) {
      toast.error("Failed to publish app");
      return;
    }

    toast.success("App published!");
    setApp({ ...app, status: "published" });
    router.refresh();
  };

  const handleUnpublish = async () => {
    const { error } = await supabase
      .from("prompt_apps")
      .update({ status: "draft" })
      .eq("id", app.id);

    if (error) {
      toast.error("Failed to unpublish app");
      return;
    }

    toast.success("App unpublished");
    setApp({ ...app, status: "draft" });
    router.refresh();
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteDialogOpen(false);

    try {
      const response = await fetch(`/api/prompt-apps/${app.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete app");
      }

      toast.success("App deleted");
      router.push("/prompt-apps");
    } catch (error) {
      console.error("Error deleting app:", error);
      toast.error("Failed to delete app");
      setIsDeleting(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset all edit fields to current app values
    setEditName(app.name);
    setEditSlug(app.slug);
    setEditTagline(app.tagline || "");
    setEditDescription(app.description || "");
    setEditComponentCode(app.component_code);
    setEditTags(app.tags.join(", "));
    setEditRateLimitPerIp(app.rate_limit_per_ip.toString());
    setEditRateLimitWindowHours(app.rate_limit_window_hours.toString());
    setEditRateLimitAuthenticated(app.rate_limit_authenticated.toString());
    setMode("view");
  };

  const hasUnsavedChanges =
    mode === "edit" &&
    (editComponentCode !== app.component_code ||
      editName !== app.name ||
      editSlug !== app.slug ||
      editTagline !== (app.tagline || "") ||
      editDescription !== (app.description || "") ||
      editTags !== app.tags.join(", ") ||
      editFaviconUrl !== (app.favicon_url || ""));

  const handleAIEditFromHeader = () => {
    if (mode !== "edit") setMode("edit");
    setShowAIEditor(true);
  };

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      <PromptAppHeader
        mode={mode}
        onModeChange={(m) => {
          if (m === "run") setIsIframeLoading(true);
          setMode(m);
        }}
        isSaving={isSaving}
        onAIEdit={handleAIEditFromHeader}
      />
      {/* Unsaved Changes Banner — OUTSIDE scrollable area so it's always visible */}
      {hasUnsavedChanges && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-orange-300/60 bg-orange-50/90 dark:border-orange-600/40 dark:bg-orange-950/40 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
              You have unsaved changes — click &ldquo;Save Changes&rdquo; to
              persist them.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isSaving ? "Saving..." : "Save Now"}
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4 md:space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
              <Link href="/prompt-apps">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7 rounded-full hover:bg-primary/10 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">
                    {app.name}
                  </h1>
                  <Badge
                    variant={
                      app.status === "published" ? "default" : "secondary"
                    }
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                      app.status === "published" &&
                        "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
                    )}
                  >
                    {app.status === "published" ? "● Published" : "○ Draft"}
                  </Badge>
                </div>
                {app.tagline && (
                  <p className="text-sm md:text-base text-muted-foreground mt-1 line-clamp-2">
                    {app.tagline}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              {mode === "edit" ? (
                <>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 sm:flex-initial"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {app.status === "published" && (
                    <Link
                      href={`/p/${app.slug}`}
                      target="_blank"
                      className="flex-1 sm:flex-initial"
                    >
                      <Button variant="outline" className="w-full">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">View Public</span>
                        <span className="sm:hidden">Public</span>
                      </Button>
                    </Link>
                  )}
                  {app.status === "published" ? (
                    <Button
                      variant="outline"
                      onClick={handleUnpublish}
                      className="flex-1 sm:flex-initial"
                    >
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      onClick={handlePublish}
                      className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Rocket className="w-4 h-4 mr-2" />
                      Publish
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    size="icon"
                    className="shrink-0 h-8 w-8 rounded-full"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Mode Switcher + Prompt Link */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="hidden sm:inline-flex p-1 rounded-lg bg-muted/50 border border-border/50 gap-1">
              <Button
                variant={mode === "view" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("view")}
                className={cn("transition-all", mode === "view" && "shadow-sm")}
              >
                <Eye className="w-4 h-4 mr-2" />
                View
              </Button>
              <Button
                variant={mode === "edit" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("edit")}
                disabled={isSaving}
                className={cn("transition-all", mode === "edit" && "shadow-sm")}
              >
                <Code2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant={mode === "run" ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setMode("run");
                  setIsIframeLoading(true);
                }}
                className={cn("transition-all", mode === "run" && "shadow-sm")}
              >
                <Play className="w-4 h-4 mr-2" />
                Run
              </Button>
            </div>

            {/* Prompt Builder Link - Always visible */}
            {app.prompt_id && (
              <Link
                href={`/ai/prompts/edit/${app.prompt_id}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:border-primary/30 transition-all group"
              >
                <Wand2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-primary">
                  {promptName || "Loading prompt..."}
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary transition-colors" />
              </Link>
            )}
          </div>

          {/* Unsaved Changes Banner — moved to above the scroll area for persistent visibility */}

          {/* Prompt Updated Banner */}
          {isPromptStale && app.prompt_id && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-300/60 bg-amber-50/80 dark:border-amber-600/40 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  The linked prompt has been updated since this app was last
                  saved.
                  {promptUpdatedAt && (
                    <span className="text-amber-600/80 dark:text-amber-400/80 ml-1">
                      (Prompt updated{" "}
                      {new Date(promptUpdatedAt).toLocaleDateString()})
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsUpdatePromptModalOpen(true)}
                className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                Update from Prompt
              </Button>
            </div>
          )}

          {/* Update from Prompt — also available when not stale */}
          {!isPromptStale && app.prompt_id && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsUpdatePromptModalOpen(true)}
                className="text-muted-foreground hover:text-primary"
              >
                <ArrowDownToLine className="w-4 h-4 mr-1.5" />
                Sync from Prompt
              </Button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Runs */}
            <div className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-blue-50/50 to-background dark:from-blue-950/20 dark:to-background transition-all hover:shadow-md hover:scale-[1.02]">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0.5 border-blue-200 dark:border-blue-800"
                  >
                    Total
                  </Badge>
                </div>
                <div className="text-2xl font-bold text-foreground mb-0.5">
                  {app.total_executions.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  Total Runs
                </p>
              </div>
            </div>

            {/* Unique Users */}
            <div className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-purple-50/50 to-background dark:from-purple-950/20 dark:to-background transition-all hover:shadow-md hover:scale-[1.02]">
              <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0.5 border-purple-200 dark:border-purple-800"
                  >
                    Unique
                  </Badge>
                </div>
                <div className="text-2xl font-bold text-foreground mb-0.5">
                  {app.unique_users_count.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  Unique Users
                </p>
              </div>
            </div>

            {/* Success Rate */}
            <div className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-green-50/50 to-background dark:from-green-950/20 dark:to-background transition-all hover:shadow-md hover:scale-[1.02]">
              <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0.5 border-green-200 dark:border-green-800"
                  >
                    Rate
                  </Badge>
                </div>
                <div className="text-2xl font-bold text-foreground mb-0.5">
                  {app.total_executions === 0
                    ? "—"
                    : `${Math.round((app.success_rate || 0) * 100)}%`}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  Success Rate
                </p>
              </div>
            </div>

            {/* Avg Time */}
            <div className="group relative overflow-hidden rounded-lg border bg-gradient-to-br from-orange-50/50 to-background dark:from-orange-950/20 dark:to-background transition-all hover:shadow-md hover:scale-[1.02]">
              <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0.5 border-orange-200 dark:border-orange-800"
                  >
                    Avg
                  </Badge>
                </div>
                <div className="text-2xl font-bold text-foreground mb-0.5">
                  {app.avg_execution_time_ms
                    ? `${Math.round(app.avg_execution_time_ms)}ms`
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  Avg Time
                </p>
              </div>
            </div>
          </div>

          {/* Mode Content */}
          {mode === "view" && (
            <Tabs defaultValue="details" className="space-y-4">
              <TabsList className="bg-muted/50 p-1 h-auto">
                <TabsTrigger
                  value="details"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Basic Information
                </TabsTrigger>
                <TabsTrigger
                  value="code"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Component Code
                </TabsTrigger>
                <TabsTrigger
                  value="variables"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Variables
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  Additional Configuration
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="details"
                className="space-y-4 animate-in fade-in-50 duration-300"
              >
                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Name
                        </label>
                        <p className="text-foreground font-medium">
                          {app.name}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Slug
                        </label>
                        <a
                          href={`https://aimatrx.com/p/fast/${app.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary font-mono text-sm underline decoration-muted-foreground/50 hover:decoration-primary transition-colors block"
                        >
                          aimatrx.com/p/fast/{app.slug}
                        </a>
                      </div>
                    </div>
                    {/* Prompt Info (link also shown in header above for quick access) */}
                    {app.prompt_id && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Powered by Prompt
                        </label>
                        <div className="flex items-center gap-2">
                          <Wand2 className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm font-medium text-foreground">
                            {promptName || "Loading prompt..."}
                          </span>
                        </div>
                        <PromptIdCopyBadge promptId={app.prompt_id} />
                      </div>
                    )}
                    {app.description && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Description
                        </label>
                        <p className="text-foreground text-sm whitespace-pre-wrap leading-relaxed">
                          {app.description}
                        </p>
                      </div>
                    )}
                    {app.tags && app.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Tags
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {app.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="rounded-full px-3 py-1"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="code"
                className="animate-in fade-in-50 duration-300"
              >
                <Card className="border-border/50 shadow-sm overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/30">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Code2 className="w-5 h-5 text-primary" />
                      Component Code
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-64">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      }
                    >
                      <CodeBlock
                        code={app.component_code}
                        language={app.component_language || "tsx"}
                        showLineNumbers={true}
                        allowEdit={false}
                      />
                    </Suspense>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="variables"
                className="animate-in fade-in-50 duration-300"
              >
                <Card className="border-border/50 shadow-sm overflow-hidden">
                  <CardHeader className="pb-3 bg-muted/30">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      Variable Schema
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-64">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      }
                    >
                      <CodeBlock
                        code={JSON.stringify(app.variable_schema, null, 2)}
                        language="json"
                        showLineNumbers={true}
                        allowEdit={false}
                      />
                    </Suspense>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="settings"
                className="space-y-4 animate-in fade-in-50 duration-300"
              >
                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Rate Limiting</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Executions per IP
                        </label>
                        <p className="text-xl font-bold text-foreground">
                          {app.rate_limit_per_ip}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Window (hours)
                        </label>
                        <p className="text-xl font-bold text-foreground">
                          {app.rate_limit_window_hours}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Authenticated users
                        </label>
                        <p className="text-xl font-bold text-foreground">
                          {app.rate_limit_authenticated}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          per window
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Allowed Imports</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {((app.allowed_imports as string[]) || []).map(
                        (imp: string) => (
                          <Badge
                            key={imp}
                            variant="outline"
                            className="font-mono text-xs rounded-md px-2.5 py-1"
                          >
                            {imp}
                          </Badge>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {mode === "edit" && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="name"
                        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="My Awesome App"
                        className="transition-all focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="slug"
                        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                      >
                        Slug <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">
                          aimatrx.com/p/fast/
                        </span>
                        <Input
                          id="slug"
                          value={editSlug}
                          onChange={(e) =>
                            setEditSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "-"),
                            )
                          }
                          placeholder="my-awesome-app"
                          className="flex-1 font-mono text-sm transition-all focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="tagline"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      Tagline
                    </Label>
                    <Input
                      id="tagline"
                      value={editTagline}
                      onChange={(e) => setEditTagline(e.target.value)}
                      placeholder="Short description of your app"
                      className="transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="description"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Detailed description of what your app does"
                      rows={4}
                      className="resize-none transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="tags"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      Tags (comma-separated)
                    </Label>
                    <Input
                      id="tags"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="ai, productivity, writing"
                      className="transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="favicon"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Image className="w-3.5 h-3.5" />
                      App Icon / Favicon
                    </Label>
                    <div className="flex items-center gap-2">
                      {editFaviconUrl && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-md border border-border overflow-hidden bg-muted">
                          <InlineMediaRef
                            ref={editFaviconUrl}
                            alt="App favicon"
                            size="fill"
                            fit="cover"
                            rounded="none"
                          />
                        </div>
                      )}
                      <Input
                        id="favicon"
                        value={editFaviconUrl}
                        onChange={(e) => setEditFaviconUrl(e.target.value)}
                        placeholder="Auto-generated, uploaded, or pasted URL"
                        className="flex-1 transition-all focus:ring-2 focus:ring-primary/20"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUploadFavicon}
                        title="Upload a custom icon (auto-resized to 192×192 and 64×64)"
                        className="flex-shrink-0"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span className="ml-1.5">Upload</span>
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Click Upload to drop a custom image, or paste any URL
                      into the field.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-gradient-to-r from-primary/5 to-transparent">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-primary" />
                    Component Code
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAIEditor(true)}
                    className="ml-auto hover:bg-primary/10 hover:text-primary hover:border-primary transition-colors"
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    AI Edit
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <CodeBlock
                      code={editComponentCode}
                      language={app.component_language || "tsx"}
                      showLineNumbers={true}
                      onCodeChange={(newCode) => setEditComponentCode(newCode)}
                      customBuiltinKeys={["prompt-app-ui-editor"]}
                    />
                  </Suspense>
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Rate Limiting</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="rate_limit_ip"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      Executions per IP
                    </Label>
                    <Input
                      id="rate_limit_ip"
                      type="number"
                      value={editRateLimitPerIp}
                      onChange={(e) => setEditRateLimitPerIp(e.target.value)}
                      className="transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="rate_limit_window"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      Window (hours)
                    </Label>
                    <Input
                      id="rate_limit_window"
                      type="number"
                      value={editRateLimitWindowHours}
                      onChange={(e) =>
                        setEditRateLimitWindowHours(e.target.value)
                      }
                      className="transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="rate_limit_auth"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                    >
                      Authenticated Users
                    </Label>
                    <Input
                      id="rate_limit_auth"
                      type="number"
                      value={editRateLimitAuthenticated}
                      onChange={(e) =>
                        setEditRateLimitAuthenticated(e.target.value)
                      }
                      className="transition-all focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {mode === "run" && (
            <Card className="border-border/50 shadow-sm animate-in fade-in-50 duration-300">
              <CardHeader className="pb-3 bg-gradient-to-r from-green-500/5 to-transparent">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Play className="w-5 h-5 text-green-600 dark:text-green-400" />
                  Preview App
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="border rounded-lg overflow-hidden bg-background shadow-inner relative">
                  {isIframeLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground font-medium">
                          Loading preview...
                        </p>
                      </div>
                    </div>
                  )}
                  <iframe
                    src={`/preview/${app.id}`}
                    className="w-full h-[600px] border-0"
                    title="App Preview"
                    onLoad={() => setIsIframeLoading(false)}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Update from Prompt Modal */}
      {app.prompt_id && (
        <UpdatePromptAppModal
          isOpen={isUpdatePromptModalOpen}
          onClose={() => setIsUpdatePromptModalOpen(false)}
          promptId={app.prompt_id}
          promptName={promptName || app.name}
          mode="from-app"
          app={app}
          onSuccess={() => {
            setIsUpdatePromptModalOpen(false);
            setIsPromptStale(false);
            router.refresh();
          }}
        />
      )}

      {/* AI Code Editor Modal — agent-system replacement of legacy AICodeEditorModal */}
      <SmartCodeEditorModal
        open={showAIEditor}
        onOpenChange={setShowAIEditor}
        agents={PROMPT_APP_AGENT_PICKER}
        defaultPickerAgentId={PROMPT_APP_AGENT_PICKER[0].id}
        initialCode={editComponentCode}
        language={app.component_language || "tsx"}
        onCodeChange={(newCode) => setEditComponentCode(newCode)}
        title="AI Code Editor"
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete App
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{app.name}&quot;? This
              action cannot be undone and will permanently remove the app and
              all its execution history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete App
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
