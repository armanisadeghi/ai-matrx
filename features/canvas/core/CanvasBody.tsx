"use client";

/**
 * CanvasBody — the type-keyed renderer switch, extracted so it can be
 * reused independently of any chrome (header, share sheet, sync controls).
 *
 * One consumer: `features/canvas/host/ArtifactCanvasView.tsx`, the body of
 * every artifact tab on the canvas (@ai-matrx/canvas).
 *
 * If you're adding a new content type:
 *   - Add the case here (one place)
 *   - Register metadata in `canvas-block-meta.ts`
 *   - Add it to `CanvasContentType` (features/canvas/canvasContent.ts) and its icon in `features/canvas/host/artifactKinds.tsx`
 *   - Remember: renderers MUST handle partial state during streaming.
 */

import React from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, RefreshCw } from "lucide-react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import {
  isMaterializedArtifactId,
  readArtifactPointerId,
} from "@/features/canvas/artifact-types/artifactId";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import { isJsonObject, type JsonValue } from "@/types/json";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// Blocks that are NOT handled by the unified renderer (code_preview /
// code_edit_error are NON_PERSISTABLE and have no artifact renderer). Their
// data is JSON; their buttons resolve live callbacks by id (liveCallbacks.ts).
const LiveCodePreviewCanvas = dynamic(
  () =>
    import("@/features/canvas/custom-components/LiveCodeEditCanvases").then(
      (m) => ({ default: m.LiveCodePreviewCanvas }),
    ),
  { ssr: false },
);
// The live SANDBOX pane — Terminal / Files / Activity for the box bound to a
// conversation. Heavy (a pty client + a file tree), so it stays out of the
// canvas base chunk until a sandbox pane actually opens. CanvasPane supplies
// the frame and the "Sandbox" header; this body renders bare.
const SandboxCanvasBody = dynamic(
  () =>
    import(
      "@ai-matrx/chat/agents/components/chat/sandbox-insight/SandboxCanvasBody"
    ).then((m) => ({ default: m.SandboxCanvasBody })),
  { ssr: false },
);
// A CLOUD DOCUMENT hosted in the canvas pane. The body mounts the canonical
// `DocumentEditor` (Univer) — heavy and window-dependent, so it stays out of
// the canvas base chunk until a document pane actually opens. CanvasPane
// supplies the frame and the document's title; this body renders bare.
const DocumentCanvasBody = dynamic(
  () =>
    import("@/features/documents/components/DocumentCanvasBody").then((m) => ({
      default: m.DocumentCanvasBody,
    })),
  { ssr: false },
);
// A TOPICAL MAP hosted in the canvas pane. The body mounts the canonical
// `TopicalMapWorkspaceBody` (the page route's and the window's component) in
// `host="canvas"` with a screen switcher; heavy (the map slice, six views, the
// graph's own lazy edge), so it stays out of the canvas base chunk until a map
// pane actually opens. CanvasPane supplies the frame and the title.
const TopicalMapCanvasBody = dynamic(
  () =>
    import("@/features/marketing/seo/topical-map/canvas/TopicalMapCanvasBody").then((m) => ({
      default: m.TopicalMapCanvasBody,
    })),
  { ssr: false },
);
const LiveCodeEditErrorCanvas = dynamic(
  () =>
    import("@/features/canvas/custom-components/LiveCodeEditCanvases").then(
      (m) => ({ default: m.LiveCodeEditErrorCanvas }),
    ),
  { ssr: false },
);
// Live Cloud Browser surface hosted in the canvas pane. CanvasPane supplies the
// frame + header, so the bare body renders WITHOUT its own WindowPanel chrome
// ("a host frame either IS the chrome or has none"). Heavy (screenshot stream,
// takeover canvas, telemetry) — kept out of the canvas base chunk until opened.
const CloudBrowserBody = dynamic(
  () =>
    import("@/features/cloud-browser/components/CloudBrowserBody").then(
      (m) => ({ default: m.CloudBrowserBody }),
    ),
  { ssr: false },
);

export interface CanvasBodyProps {
  content: CanvasContent;
}

export function CanvasBody({ content }: CanvasBodyProps) {
  const def = getArtifactDef(content.type);
  const metadataArtifactId = isMaterializedArtifactId(
    content.metadata?.canvasItemId,
  )
    ? content.metadata?.canvasItemId
    : undefined;
  const artifactId =
    def && hasArtifactRenderer(def.canvasType)
      ? (metadataArtifactId ?? readArtifactPointerId(content.data))
      : undefined;

  if (def && artifactId) {
    return (
      <PersistedArtifactCanvasBody
        content={content}
        artifactId={artifactId}
        resolveLatest={Boolean(def.userEditable)}
      />
    );
  }

  return renderContent(content);
}

interface StoredArtifactPayload {
  data: JsonValue;
  metadata?: Record<string, JsonValue>;
}

function readStoredArtifactPayload(
  content: unknown,
): StoredArtifactPayload | null {
  if (typeof content === "string") return { data: content };
  if (!isJsonObject(content)) return null;

  const data = content.data;
  if (data === undefined || data === null || data === "") return null;

  const storedMetadata = isJsonObject(content.metadata)
    ? Object.fromEntries(
        Object.entries(content.metadata).filter(
          (entry): entry is [string, JsonValue] => entry[1] !== undefined,
        ),
      )
    : undefined;

  return { data, metadata: storedMetadata };
}

function mergeArtifactMetadata(
  stored: Record<string, JsonValue> | undefined,
  session: CanvasContent["metadata"],
  artifactId: string,
  artifactVersion: number,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (stored) {
    for (const [key, value] of Object.entries(stored)) {
      metadata[key] = value;
    }
  }
  if (session) {
    for (const [key, value] of Object.entries(session)) {
      metadata[key] = value;
    }
  }
  metadata.canvasItemId = artifactId;
  metadata.artifactVersion = artifactVersion;
  return metadata;
}

function PersistedArtifactCanvasBody({
  content,
  artifactId,
  resolveLatest,
}: {
  content: CanvasContent;
  artifactId: string;
  resolveLatest: boolean;
}) {
  const { row, loading, error, refetch } = useCanvasItem(artifactId, {
    resolve: resolveLatest ? "latest" : "exact",
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <MatrxMiniLoader />
        <span className="sr-only">Loading saved artifact</span>
      </div>
    );
  }

  const stored = row ? readStoredArtifactPayload(row.content) : null;
  const persistedDef = row ? getArtifactDef(row.type) : undefined;
  if (
    error ||
    !row ||
    !stored ||
    !persistedDef ||
    !hasArtifactRenderer(persistedDef.canvasType)
  ) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">
              Couldn't load the saved artifact
              <ErrorAlchemyMenu />
            </p>
            <p className="mt-1 text-xs">
              The Canvas kept its identity, but the saved content was not
              available.
            </p>
          </div>
          <TapTargetButton
            icon={<RefreshCw className="h-4 w-4" />}
            label="Try again"
            ariaLabel="Try loading the saved artifact again"
            onClick={refetch}
          />
        </div>
      </div>
    );
  }

  const metadata = mergeArtifactMetadata(
    stored.metadata,
    content.metadata,
    row.id,
    row.version,
  );
  const conversationId =
    typeof metadata.conversationId === "string"
      ? metadata.conversationId
      : undefined;
  const messageId =
    typeof metadata.messageId === "string" ? metadata.messageId : undefined;

  return (
    <div className="h-full">
      <ArtifactRender
        canvasType={persistedDef.canvasType}
        mode="canvas"
        data={stored.data}
        metadata={metadata}
        artifactId={row.id}
        conversationId={conversationId}
        messageId={messageId}
      />
    </div>
  );
}

function renderContent(content: CanvasContent): React.ReactNode {
  const { type, data } = content;

  // ── Unified artifact renderer (Wave B) ───────────────────────────────────
  // Types with a unified renderer registered render through the single shared
  // path; the rest fall through to their legacy case below.
  const _def = getArtifactDef(type);
  if (_def && hasArtifactRenderer(_def.canvasType)) {
    const meta = content.metadata;
    const artifactId = meta?.canvasItemId ?? readArtifactPointerId(data);
    const metadata: Record<string, unknown> = {};
    if (content.metadata) {
      for (const [key, value] of Object.entries(content.metadata)) {
        metadata[key] = value;
      }
    }
    return (
      <div className="h-full">
        <ArtifactRender
          canvasType={_def.canvasType}
          mode="canvas"
          data={data}
          metadata={metadata}
          artifactId={artifactId}
          conversationId={meta?.conversationId}
          messageId={meta?.messageId}
        />
      </div>
    );
  }

  // quiz, presentation, recipe, timeline, research, resources, progress,
  // troubleshooting, decision-tree, diagram, flashcards, math_problem,
  // mermaid, code, iframe, html, image → unified renderer via early-branch
  // (cases removed in Wave F; only NON_PERSISTABLE types remain below)
  switch (type) {
    case "code_preview":
      return <LiveCodePreviewCanvas data={data} />;

    case "cloud_browser":
      // `data` is a pointer { initialProfileId?, runId? } and the metadata
      // carries the chat binding. The body owns all live run/screenshot/handoff
      // state; the pane draws the frame + title. All three are load-bearing:
      // `runId` pins the exact browser, `conversationId` is what lets taking
      // control steer the running agent instead of yanking the wheel.
      return (
        <CloudBrowserBody
          initialProfileId={
            typeof data?.initialProfileId === "string"
              ? data.initialProfileId
              : undefined
          }
          runId={typeof data?.runId === "string" ? data.runId : undefined}
          conversationId={content.metadata?.conversationId}
          className="h-full"
        />
      );

    case "sandbox":
      // `data` is a pointer { sandboxRowId, fallbackName? } and the metadata
      // carries the chat binding. The body holds the live pty / file tree and
      // reads the conversation's sandbox tool calls; the pane draws the frame
      // and the title. Never persisted — see NON_PERSISTABLE_CANVAS_TYPES.
      return (
        <SandboxCanvasBody
          sandboxRowId={
            typeof data?.sandboxRowId === "string" ? data.sandboxRowId : ""
          }
          fallbackName={
            typeof data?.fallbackName === "string"
              ? data.fallbackName
              : undefined
          }
          conversationId={content.metadata?.conversationId}
          className="h-full"
        />
      );

    case "udt_document":
      // `data` is a pointer { documentId }. The row is the truth and the
      // editor persists itself (udt_document_snapshots), so nothing about the
      // document is ever carried in the canvas envelope — see
      // NON_PERSISTABLE_CANVAS_TYPES.
      return (
        <DocumentCanvasBody
          documentId={
            typeof data?.documentId === "string" ? data.documentId : ""
          }
          fallbackTitle={
            typeof content.metadata?.title === "string"
              ? content.metadata.title
              : undefined
          }
          className="h-full"
        />
      );

    case "topical_map":
      // `data` is a pointer { mapId, screen, siteId }. The rows are the truth
      // and the body reads them live — see NON_PERSISTABLE_CANVAS_TYPES.
      return (
        <TopicalMapCanvasBody
          mapId={typeof data?.mapId === "string" ? data.mapId : ""}
          initialScreen={typeof data?.screen === "string" ? data.screen : "outline"}
          siteId={typeof data?.siteId === "string" ? data.siteId : null}
          conversationId={content.metadata?.conversationId}
          className="h-full"
        />
      );

    case "code_edit_error":
      return <LiveCodeEditErrorCanvas data={data} />;

    default:
      return (
        <div className="h-full flex items-center justify-center p-6 text-center text-muted-foreground">
          <div>
            <p className="text-sm mb-2">
              Unsupported content type: <code>{type}</code>
            </p>
            <p className="text-xs">Add a renderer in CanvasBody.tsx.</p>
          </div>
        </div>
      );
  }
}
