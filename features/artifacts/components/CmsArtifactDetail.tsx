"use client";

import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectArtifactByEitherId } from "@/lib/redux/selectors/artifactSelectors";
import { fetchUserArtifactsThunk } from "@/lib/redux/thunks/artifactThunks";
import { deleteArtifactThunk } from "@/lib/redux/thunks/artifactThunks";
import {
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_STATUS_LABELS,
} from "@/features/artifacts/types";
import type { ArtifactStatus, CxArtifactRow } from "@/features/artifacts/types";
import { rowToArtifactRecord } from "@/features/artifacts/types";
import { upsertArtifact } from "@/lib/redux/slices/artifactsSlice";
import { createClient } from "@/utils/supabase/client";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { fetchAccessDeniedContext } from "@/features/access-gate/service/accessDeniedContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ExternalLink,
  Globe,
  Loader2,
  MessageSquare,
  Clock,
  Tag,
  Building2,
  FolderKanban,
  CheckSquare,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LucideIcon } from "lucide-react";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ArtifactRenderDynamic as ArtifactRender } from "@/features/canvas/artifact-types/ArtifactRenderDynamic";
import { hasArtifactRenderer } from "@/features/canvas/artifact-types/artifact-renderer-keys";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

// ── CanvasItemPreview ─────────────────────────────────────────────────────────

/**
 * Loads a canvas_items row by id and renders it via the unified ArtifactRender.
 * Shown inside CmsArtifactDetail when the artifact has a canvas_item_id.
 */
function CanvasItemPreview({ canvasItemId }: { canvasItemId: string }) {
  // reportUnavailable: false — a missing row must reach <AccessGate> as a
  // null read (an access question), not as the hook's composed message string,
  // which the gate would classify as a fault. The gate does its own capture.
  const { row, loading, error, refetch } = useCanvasItem(canvasItemId, {
    resolve: "latest",
    reportUnavailable: false,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !row) {
    // The canonical access gate says which of denied / deleted / never
    // existed / fault this is, instead of a bare "unavailable".
    return (
      <AccessGate
        token="canvas_item"
        id={canvasItemId}
        error={error ?? undefined}
        onRetry={refetch}
      />
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

  const renderer = (
    <ArtifactRender
      canvasType={canvasType}
      mode="canvas"
      data={data}
      metadata={metadata as Record<string, unknown> | undefined}
      artifactId={row.id}
    />
  );

  // The diagram's canonical workspace renderer intentionally fills its host.
  // The library detail card is not itself a bounded workspace, so give only
  // that renderer a real viewport instead of allowing React Flow to mount at
  // zero height.
  return canvasType === "diagram" ? (
    <div className="h-[70dvh] min-h-[420px] max-h-[720px] sm:min-h-[480px]">
      {renderer}
    </div>
  ) : renderer;
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
  /** THE DOOR LAW: a row naming a record with an identity opens it (new tab). */
  href?: string | null;
}

function MetaRow({ icon: Icon, label, value, href }: MetaRowProps) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
          {label}
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary break-all hover:underline underline-offset-2"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-foreground break-all">{value}</p>
        )}
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
  // The route param is either a chat.artifact id (the library's links) or a
  // canvas_items id (what the canvas pane's "Open full page" knows).
  const artifact = useAppSelector((state) =>
    selectArtifactByEitherId(state, artifactId),
  );
  const store = useAppStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // What the id turned out to be when it is not one of the viewer's own
  // artifacts. Keyed to the id so a stale answer never applies to a new route.
  const [unlisted, setUnlisted] = useState<
    | { id: string; kind: "canvas-item" }
    | { id: string; kind: "gate"; token: "artifact" | "canvas_item" }
    | null
  >(null);

  // Load if not in store. The library list holds only the viewer's OWN
  // artifacts, so absence from it decides nothing: the id is then read BY ID
  // (RLS decides — a shared artifact opens), and when nothing can be read the
  // canonical access gate says whether it is denied, deleted or never existed.
  useEffect(() => {
    if (artifact) return undefined;
    let active = true;
    setIsRefreshing(true);
    void (async () => {
      await dispatch(fetchUserArtifactsThunk(undefined));
      if (!active) return;
      if (selectArtifactByEitherId(store.getState(), artifactId)) return;

      const next = await resolveUnlistedArtifact(artifactId);
      if (!active) return;
      if (next.kind === "artifact") {
        dispatch(upsertArtifact(rowToArtifactRecord(next.row)));
      } else {
        setUnlisted({ id: artifactId, ...next });
      }
    })().finally(() => {
      // Unconditional: the artifact landing in the store re-runs this effect
      // (cleanup flips `active`) before this settles, and a guarded reset left
      // the page on "Loading artifact…" forever.
      setIsRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [artifact, artifactId, dispatch, store]);

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

  // The artifact's AFTER — the real html_pages row it became. `externalId` IS
  // that row's id (see features/canvas/artifact-types/persistence/html-adapter.ts),
  // so the door is the real editor route, never a content-less preview overlay
  // (the old htmlPreview dispatch with content:"" opened an empty editor —
  // present-but-broken, worse than absent).
  const handleOpenEditor = () => {
    if (!artifact?.externalId) return;
    router.push(`/cms/html-pages/${artifact.externalId}`);
  };

  if (isRefreshing && !artifact) {
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/artifacts" ariaLabel="Content Library" />}
        />
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading artifact…</p>
          </div>
        </div>
      </>
    );
  }

  if (!artifact) {
    const resolved = unlisted?.id === artifactId ? unlisted : null;
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/artifacts" ariaLabel="Content Library" />}
        />
        {resolved?.kind === "canvas-item" ? (
          // A canvas item the viewer can read that was never registered as a
          // library artifact: show the content itself.
          <Card>
            <CardContent className="pt-6">
              <CanvasItemPreview canvasItemId={artifactId} />
            </CardContent>
          </Card>
        ) : resolved?.kind === "gate" ? (
          <AccessGate
            token={resolved.token}
            id={artifactId}
            fallbackHref="/artifacts"
            fallbackLabel="Content Library"
          />
        ) : (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </>
    );
  }

  const typeLabel =
    ARTIFACT_TYPE_LABELS[artifact.artifactType] ?? artifact.artifactType;
  const statusLabel =
    ARTIFACT_STATUS_LABELS[artifact.status] ?? artifact.status;
  const statusVariant = STATUS_VARIANT[artifact.status] ?? "outline";

  const headerActions = [
    artifact.externalUrl
      ? {
          label: "View Live",
          icon: ExternalLink,
          href: artifact.externalUrl,
        }
      : null,
    artifact.artifactType === "html_page" && artifact.externalId
      ? {
          label: "Open HTML Editor",
          icon: Globe,
          onPress: handleOpenEditor,
        }
      : null,
    {
      label: "Refresh",
      icon: RefreshCw,
      onPress: () => {
        setIsRefreshing(true);
        dispatch(fetchUserArtifactsThunk(undefined)).finally(() =>
          setIsRefreshing(false),
        );
      },
      disabled: isRefreshing,
    },
    {
      label: "Delete",
      icon: Trash2,
      onPress: () => void handleDelete(),
      destructive: true,
      disabled: isDeleting,
    },
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <>
      <EntityModeHeader
        backHref="/artifacts"
        entityLabel={artifact.title ?? "Untitled"}
        actions={headerActions}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-6">
        {artifact.description && (
          <p className="text-sm text-muted-foreground">
            {artifact.description}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline">{typeLabel}</Badge>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>

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
              href={
                artifact.conversationId
                  ? `/chat/${artifact.conversationId}`
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
              href={
                artifact.conversationId
                  ? `/chat/${artifact.conversationId}`
                  : null
              }
            />
            <MetaRow
              icon={ExternalLink}
              label="HTML Page"
              value={artifact.externalId}
              href={
                artifact.artifactType === "html_page" && artifact.externalId
                  ? `/cms/html-pages/${artifact.externalId}`
                  : null
              }
            />
            <MetaRow
              icon={Globe}
              label="Live URL"
              value={artifact.externalUrl}
              href={artifact.externalUrl}
            />
          </CardContent>
        </Card>

        {/* Organizational context */}
        {(artifact.organizationId || artifact.taskId) && (
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
    </>
  );
}

/**
 * Read an id that is not in the viewer's own artifact list, BY ID. The id is a
 * chat.artifact id or a canvas_items id; row-level security decides what the
 * viewer can read. When neither row is readable, the platform's access
 * resolver says which table the id belongs to, so the gate asks about the
 * right kind of record.
 */
async function resolveUnlistedArtifact(
  id: string,
): Promise<
  | { kind: "artifact"; row: CxArtifactRow }
  | { kind: "canvas-item" }
  | { kind: "gate"; token: "artifact" | "canvas_item" }
> {
  if (!isUuidShape(id)) return { kind: "gate", token: "artifact" };
  const supabase = createClient();

  const artifactRead = await supabase
    .schema("chat")
    .from("artifact")
    .select("*")
    .or(`id.eq.${id},canvas_item_id.eq.${id}`)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (artifactRead.data) {
    return { kind: "artifact", row: artifactRead.data as CxArtifactRow };
  }

  const canvasRead = await supabase
    .schema("canvas")
    .from("canvas_items")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (canvasRead.data) return { kind: "canvas-item" };

  // Ask about the canvas item only when no artifact row has this id; an id
  // that is neither reads as a missing artifact (this is the artifacts route).
  const asArtifact = await fetchAccessDeniedContext("artifact", id);
  if (asArtifact.status !== "missing") return { kind: "gate", token: "artifact" };
  const asCanvasItem = await fetchAccessDeniedContext("canvas_item", id);
  return {
    kind: "gate",
    token: asCanvasItem.status === "missing" ? "artifact" : "canvas_item",
  };
}
