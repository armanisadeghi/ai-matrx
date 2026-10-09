"use client";

import React from "react";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import SandboxedHtml from "@ai-matrx/rich-content/display/blocks/common/SandboxedHtml";
import { KindValueFrontDoor } from "@/components/official/structured-value/KindValueFrontDoor";
import { valueCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";

import { safeEmbedUrl } from "@/lib/iframe/embed-url";
import { usePageSandbox } from "@/lib/iframe/use-page-sandbox";

interface PublicCanvasRendererProps {
  content: CanvasContent | any;
}

/**
 * Public Canvas Renderer
 *
 * Delegates to the unified ArtifactRender for every type that has a registered
 * renderer. The adapters' resolveJsonPayload / resolveMarkdownPayload already
 * handle string-vs-object `data`, which also fixes the blank-JSON bug on public
 * shared canvases where `data` arrived as a raw string.
 *
 * For types without a unified renderer (unknown/future types), a safe fallback
 * tries to sniff URL → sandboxed iframe, HTML string → SandboxedHtml, then
 * renders a debug block.
 *
 * Redux IS available on this route (PublicProviders wraps a StoreProvider), so
 * adapters that read preferences via useAppSelector work correctly.
 */
export function PublicCanvasRenderer({ content }: PublicCanvasRendererProps) {
  const sandbox = usePageSandbox(
    safeEmbedUrl(content?.data),
    "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation",
  );
  if (!content) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
        <p className="text-sm">No content to display</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto">
      {renderContent(content, sandbox)}
    </div>
  );
}

function renderContent(
  content: CanvasContent | any,
  sandbox: string,
): React.ReactNode {
  const { type, data } = content;

  // Delegate to the unified artifact renderer for every registered type.
  // This covers: comparison, flashcards, timeline, research, resources,
  // progress, troubleshooting, recipe, diagram, decision-tree, presentation,
  // math_problem, quiz, mermaid, html, iframe, code, image.
  if (hasArtifactRenderer(type)) {
    return (
      <div className="h-full">
        <ArtifactRender
          canvasType={type}
          mode="canvas"
          data={data}
          metadata={content.metadata as Record<string, unknown> | undefined}
          // Anonymous surface: html/react renderers downgrade to a safe,
          // non-executing sandboxed view (no attacker scripts in a visitor's session).
          isPublic
        />
      </div>
    );
  }

  // A kind payload on a type with no renderer goes through the one kind door
  // — its component, or the readable floor — never the debug dump or the
  // HTML sniff below (V8, a kind is never drawn as raw JSON).
  if (valueCarriesKind(data)) {
    return (
      <div className="h-full overflow-auto p-4">
        <KindValueFrontDoor value={data} />
      </div>
    );
  }

  // Fallback for types with no unified renderer (unknown/future types).
  // Try to sniff a safe http(s) URL → sandboxed iframe.
  const maybeUrl = safeEmbedUrl(data);
  if (maybeUrl) {
    return (
      <iframe
        key={sandbox}
        src={maybeUrl}
        className="w-full h-full border-0"
        title={content.metadata?.title || "Canvas Content"}
        sandbox={sandbox}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
      />
    );
  }

  // Sniff HTML string → SandboxedHtml (no XSS).
  if (typeof data === "string" && (data.includes("<") || data.includes(">"))) {
    return (
      <SandboxedHtml
        html={data}
        title={content.metadata?.title || "Canvas Content"}
        height="100%"
        className="w-full h-full"
      />
    );
  }

  return (
    <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 p-4">
      <div className="text-center max-w-lg">
        <p className="text-lg mb-2">
          Unsupported content type: <code className="text-red-500">{type}</code>
        </p>
        <p className="text-sm mb-4">
          This content type is not yet supported in public view
        </p>
        <details className="text-left bg-gray-100 dark:bg-gray-800 p-4 rounded">
          <summary className="cursor-pointer font-semibold mb-2">
            Debug Info
          </summary>
          <pre className="text-xs overflow-auto">
            {JSON.stringify({ type, dataType: typeof data, data }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
