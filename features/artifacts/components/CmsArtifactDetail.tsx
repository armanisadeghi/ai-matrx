"use client";

import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectArtifactById } from "@/lib/redux/selectors/artifactSelectors";
import { fetchUserArtifactsThunk } from "@/lib/redux/thunks/artifactThunks";
import { deleteArtifactThunk } from "@/lib/redux/thunks/artifactThunks";
import {
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_STATUS_LABELS,
} from "@/features/artifacts/types";
import type { ArtifactStatus } from "@/features/artifacts/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  Globe,
  Loader2,
  AlertCircle,
  MessageSquare,
  Clock,
  Tag,
  Building2,
  FolderKanban,
  CheckSquare,
  Trash2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { LucideIcon } from "lucide-react";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { ArtifactRender, hasArtifactRenderer } from "@/features/canvas/artifact-types/artifact-renderers";

// ── CanvasItemPreview ─────────────────────────────────────────────────────────

/**
 * Loads a canvas_items row by id and renders it via the unified ArtifactRender.
 * Shown inside CmsArtifactDetail when the artifact has a canvas_item_id.
 */
function CanvasItemPreview({ canvasItemId }: { canvasItemId: string }) {
  const { row, loading, error } = useCanvasItem(canvasItemId, { resolve: "latest" });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
        <AlertCircle className="h-4 w-4" />
        <span>Canvas content unavailable</span>
      </div>
    );
  }

  const canvasType: string = row.type;
  if (!hasArtifactRenderer(canvasType)) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No renderer for type <span className="font-mono">{canvasType}</span>
      </div>
    );
  }

  // canvas_items.content is stored as { data, type, metadata }
  const contentObj = row.content as { data?: unknown; type?: string; metadata?: Record<string, unknown> } | null;
  const data = contentObj?.data ?? contentObj;
  const metadata = contentObj?.metadata;

  return (
    <ArtifactRender
      canvasType={canvasType}
      mode="canvas"
      data={data}
      metadata={metadata as Record<string, unknown> | undefined}
      artifactId={row.id}
    />
  );
}

const STATUS_VARIANT: Record<
  ArtifactStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  published: "default",
  draft: "secondary",
  archived: "outline",
  failed: "destructive",
};

interface MetaRowProps {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
}

function MetaRow({ icon: Icon, label, value }: MetaRowProps) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
          {label}
        </p>
        <p className="text-sm text-foreground break-all">{value}</p>
      </div>
    </div>
  );
}

interface CmsArtifactDetailProps {
  artifactId: string;
}

export function CmsArtifactDetail({ artifactId }: CmsArtifactDetailProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const artifact = useAppSelector((state) =>
    selectArtifactById(state, artifactId),
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load if not in store
  useEffect(() => {
    if (!artifact) {
      setIsRefreshing(true);
      dispatch(fetchUserArtifactsThunk(undefined)).finally(() =>
        setIsRefreshing(false),
      );
    }
  }, [artifact, dispatch]);

  const handleDelete = async () => {
    if (!artifact) return;
    setIsDeleting(true);
    try {
      await dispatch(deleteArtifactThunk(artifact.id)).unwrap();
      router.push("/cms");
    } catch {
      setIsDeleting(false);
    }
  };

  const handleOpenEditor = () => {
    if (!artifact) return;
    if (artifact.artifactType === "html_page") {
      dispatch(
        openOverlay({
          overlayId: "htmlPreview",
          data: {
            content: "",
            messageId: artifact.messageId,
            conversationId: artifact.conversationId,
            title: artifact.title ?? "HTML Page Editor",
            description: "Edit markdown, preview HTML, and publish your content",
            onSave: undefined,
            showSaveButton: false,
            isAgentSystem: false,
          },
        }),
      );
    }
  };

  if (isRefreshing) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading artifact…</p>
        </div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Artifact not found</p>
          <Link href="/cms">
            <Button variant="outline" size="sm">
              Back to Library
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const typeLabel =
    ARTIFACT_TYPE_LABELS[artifact.artifactType] ?? artifact.artifactType;
  const statusLabel =
    ARTIFACT_STATUS_LABELS[artifact.status] ?? artifact.status;
  const statusVariant = STATUS_VARIANT[artifact.status] ?? "outline";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl font-bold text-foreground truncate">
                  {artifact.title ?? "Untitled"}
                </CardTitle>
                {artifact.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {artifact.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline">{typeLabel}</Badge>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <Separator className="mb-4" />

            {/* Primary action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {artifact.externalUrl && (
                <Button variant="default" size="sm" className="gap-1.5" asChild>
                  <a
                    href={artifact.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Live
                  </a>
                </Button>
              )}

              {artifact.artifactType === "html_page" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleOpenEditor}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Open HTML Editor
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setIsRefreshing(true);
                  dispatch(fetchUserArtifactsThunk(undefined)).finally(() =>
                    setIsRefreshing(false),
                  );
                }}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Canvas content preview — rendered for materialized artifacts */}
        {artifact.canvasItemId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Content Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CanvasItemPreview canvasItemId={artifact.canvasItemId} />
            </CardContent>
          </Card>
        )}

        {/* External link preview (HTML pages) */}
        {artifact.externalUrl && artifact.artifactType === "html_page" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden bg-muted/30">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">
                    {artifact.externalUrl}
                  </span>
                  <a
                    href={artifact.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex-shrink-0"
                  >
                    <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
                <iframe
                  src={artifact.externalUrl}
                  className="w-full h-[400px]"
                  title="Page preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sidebar metadata */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/50">
            <MetaRow
              icon={Clock}
              label="Created"
              value={new Date(artifact.createdAt).toLocaleDateString(
                undefined,
                {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            />
            <MetaRow
              icon={Clock}
              label="Last Updated"
              value={new Date(artifact.updatedAt).toLocaleDateString(
                undefined,
                {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                },
              )}
            />
            <MetaRow icon={Tag} label="Type" value={typeLabel} />
            <MetaRow
              icon={MessageSquare}
              label="Source Message"
              value={
                artifact.messageId
                  ? `Message ${artifact.messageId.slice(0, 8)}…`
                  : null
              }
            />
            <MetaRow
              icon={MessageSquare}
              label="Conversation"
              value={
                artifact.conversationId
                  ? `Conversation ${artifact.conversationId.slice(0, 8)}…`
                  : null
              }
            />
            <MetaRow
              icon={ExternalLink}
              label="External ID"
              value={artifact.externalId}
            />
            <MetaRow
              icon={Globe}
              label="Live URL"
              value={artifact.externalUrl}
            />
          </CardContent>
        </Card>

        {/* Organizational context */}
        {(artifact.organizationId || artifact.projectId || artifact.taskId) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Context
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/50">
              <MetaRow
                icon={Building2}
                label="Organization"
                value={artifact.organizationId}
              />
              <MetaRow
                icon={FolderKanban}
                label="Project"
                value={artifact.projectId}
              />
              <MetaRow
                icon={CheckSquare}
                label="Task"
                value={artifact.taskId}
              />
            </CardContent>
          </Card>
        )}

        {/* Metadata extras */}
        {artifact.metadata && Object.keys(artifact.metadata).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-3 overflow-auto max-h-48">
                {JSON.stringify(artifact.metadata, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
