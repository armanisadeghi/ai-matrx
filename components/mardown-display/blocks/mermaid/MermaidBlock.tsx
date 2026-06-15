"use client";

/**
 * MermaidBlock — the in-chat render block for ```mermaid fences.
 *
 * Owns ALL streaming phases internally (BlockRenderer must never skeleton-swap
 * it): fence opened → catalog label + skeleton, body streaming → progressive
 * last-good renders, complete → toolbar (options, export, source, canvas).
 *
 * Render options resolve user preferences → per-artifact metadata overrides →
 * local session tweaks. Durable per-artifact options are saved by the canvas
 * workbench (the chat block's "Save as default" writes user preferences).
 */

import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Code2,
  Download,
  Expand,
  FolderUp,
  Maximize2,
  Palette,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { SimpleTooltip } from "@/components/matrx/Tooltip";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { selectCanvasIsAvailable } from "@/features/canvas/redux/canvasSlice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectMermaidPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";

import { getCatalogEntry } from "@/components/mermaid/catalog";
import { detectDiagramType, extractMermaidTitle } from "@/components/mermaid/diagram-type";
import {
  copyMermaidSource,
  downloadMermaidPng,
  downloadMermaidSource,
  downloadMermaidSvg,
  saveMermaidToWorkspace,
} from "@/components/mermaid/export";
import { MermaidRenderer } from "@/components/mermaid/MermaidRenderer";
import { MermaidFullscreen } from "@/components/mermaid/MermaidFullscreen";
import { preloadMermaid } from "@/components/mermaid/runtime";
import {
  resolveMermaidTheme,
  type MermaidArtifactMetadata,
  type MermaidLayout,
  type MermaidLook,
  type MermaidOptionPreferences,
  type MermaidThemePreference,
} from "@/components/mermaid/types";
import type { MermaidBlockData } from "@/types/python-generated/stream-events";

const CodeBlock = lazy(() => import("@/features/code-editor/components/code-block/CodeBlock"));

const THEME_CHOICES: MermaidThemePreference[] = ["auto", "default", "dark", "forest", "neutral", "base"];
const LOOK_CHOICES: MermaidLook[] = ["classic", "handDrawn"];
const LAYOUT_CHOICES: MermaidLayout[] = ["dagre", "elk"];

export interface MermaidBlockProps {
  content?: string;
  serverData?: MermaidBlockData | null;
  metadata?: Record<string, unknown>;
  isStreamActive?: boolean;
  conversationId?: string;
  messageId?: string;
  blockIndex?: number;
  taskId?: string;
  className?: string;
  /** canvas_items row id when rendering a materialized artifact by reference. */
  artifactId?: string;
  /** Artifact version when known (rendered as a chip). */
  artifactVersion?: number;
}

const MermaidBlock: React.FC<MermaidBlockProps> = ({
  content,
  serverData,
  metadata,
  isStreamActive = false,
  messageId,
  taskId,
  className,
  artifactId,
  artifactVersion,
}) => {
  const dispatch = useAppDispatch();
  const { open } = useCanvas();
  const isCanvasAvailable = useAppSelector(selectCanvasIsAvailable);
  const appMode = useAppSelector((state) => state.theme.mode);
  const userPrefs = useAppSelector(selectMermaidPreferences);

  const source = serverData?.source ?? content ?? "";
  const artifactMeta = (metadata?.mermaid ?? metadata ?? {}) as MermaidArtifactMetadata;

  // user defaults → per-artifact metadata → local session tweaks
  const [localOptions, setLocalOptions] = useState<Partial<MermaidOptionPreferences>>({});
  const effective: MermaidOptionPreferences = {
    theme: localOptions.theme ?? artifactMeta.theme ?? userPrefs.theme,
    look: localOptions.look ?? artifactMeta.look ?? userPrefs.look,
    layout: localOptions.layout ?? artifactMeta.layout ?? userPrefs.layout,
  };
  const renderOptions = {
    theme: resolveMermaidTheme(effective.theme, appMode),
    look: effective.look,
    layout: effective.layout,
  };

  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);

  // Cap the inline diagram height at ~60% of the viewport (clamped) so a tall
  // diagram scrolls in place instead of pushing the rest of the message off
  // screen — "view fullscreen" shows the whole thing. Responsive to resize.
  const [frameMaxHeight, setFrameMaxHeight] = useState(520);
  useEffect(() => {
    const recompute = () =>
      setFrameMaxHeight(Math.max(320, Math.min(720, Math.round(window.innerHeight * 0.6))));
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  // Start downloading the engine chunk while tokens are still arriving.
  useEffect(() => {
    preloadMermaid();
  }, []);

  const diagramType = detectDiagramType(source);
  const catalog = getCatalogEntry(diagramType);
  const title = serverData?.title ?? extractMermaidTitle(source) ?? artifactMeta.title ?? null;
  const Icon = catalog.icon;

  const currentSvg = () => svgEl?.outerHTML ?? null;

  const handleCopy = async () => {
    await copyMermaidSource(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveToWorkspace = async () => {
    const svg = currentSvg();
    if (!svg) {
      toast.error("Nothing rendered to save yet");
      return;
    }
    try {
      await saveMermaidToWorkspace({ svg, source, title });
      toast.success("Saved to your files (Diagrams folder)");
    } catch (err) {
      console.error("[MermaidBlock] save to workspace failed", err);
      toast.error("Could not save the diagram to your files");
    }
  };

  const handleOpenCanvas = () => {
    open({
      type: "mermaid",
      data: source,
      metadata: {
        title: title ?? catalog.label,
        sourceMessageId: messageId,
        sourceTaskId: taskId || (messageId ? `mermaid:${messageId}` : undefined),
        canvasItemId: artifactId,
        mermaid: {
          diagramType,
          title: title ?? undefined,
          theme: effective.theme,
          look: effective.look,
          layout: effective.layout,
        },
      },
    });
  };

  const setOption = <K extends keyof MermaidOptionPreferences>(
    key: K,
    value: MermaidOptionPreferences[K],
  ) => setLocalOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">
            {title ?? catalog.label}
          </span>
          {title && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {catalog.label}
            </span>
          )}
          {artifactVersion && artifactVersion > 1 ? (
            <span className="shrink-0 rounded border border-border bg-muted px-1 py-px text-[10px] text-muted-foreground">
              v{artifactVersion}
            </span>
          ) : null}
          {isStreamActive && (
            <span className="shrink-0 animate-pulse text-xs text-muted-foreground">drawing…</span>
          )}
        </div>

        {!isStreamActive && (
          <div className="flex shrink-0 items-center gap-0.5">
            <DropdownMenu>
              <SimpleTooltip text="Diagram style">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Diagram style"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Palette className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
              </SimpleTooltip>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
                {THEME_CHOICES.map((theme) => (
                  <DropdownMenuItem key={theme} onClick={() => setOption("theme", theme)}>
                    <span className="flex-1 capitalize">{theme}</span>
                    {effective.theme === theme && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Style</DropdownMenuLabel>
                {LOOK_CHOICES.map((look) => (
                  <DropdownMenuItem key={look} onClick={() => setOption("look", look)}>
                    <span className="flex-1">{look === "handDrawn" ? "Hand-drawn" : "Classic"}</span>
                    {effective.look === look && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Layout</DropdownMenuLabel>
                {LAYOUT_CHOICES.map((layout) => (
                  <DropdownMenuItem key={layout} onClick={() => setOption("layout", layout)}>
                    <span className="flex-1 uppercase">{layout}</span>
                    {effective.layout === layout && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    dispatch(setModulePreferences({ module: "mermaid", preferences: effective }));
                    toast.success("Saved as your default diagram style");
                  }}
                >
                  Save as my default
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <SimpleTooltip text="Export diagram">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Export diagram"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
              </SimpleTooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    const svg = currentSvg();
                    if (svg) downloadMermaidSvg(svg, title);
                    else toast.error("Nothing rendered yet");
                  }}
                >
                  Download SVG
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    const svg = currentSvg();
                    if (!svg) {
                      toast.error("Nothing rendered yet");
                      return;
                    }
                    try {
                      await downloadMermaidPng(svg, title);
                    } catch (err) {
                      console.error("[MermaidBlock] PNG export failed", err);
                      toast.error("PNG export failed");
                    }
                  }}
                >
                  Download PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadMermaidSource(source, title)}>
                  Download source (.mmd)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSaveToWorkspace}>
                  <FolderUp className="mr-1.5 h-3.5 w-3.5" />
                  Save to my files
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <SimpleTooltip text={copied ? "Copied" : "Copy diagram source"}>
              <button
                type="button"
                aria-label="Copy diagram source"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </SimpleTooltip>

            <SimpleTooltip text={showSource ? "Hide source" : "Show source"}>
              <button
                type="button"
                aria-label={showSource ? "Hide source" : "Show source"}
                className={cn(
                  "rounded p-1.5 transition-colors hover:bg-primary/10 hover:text-primary",
                  showSource ? "text-primary" : "text-muted-foreground",
                )}
                onClick={() => setShowSource((v) => !v)}
              >
                <Code2 className="h-3.5 w-3.5" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip text="View fullscreen">
              <button
                type="button"
                aria-label="View fullscreen"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                onClick={() => setFullscreen(true)}
              >
                <Expand className="h-3.5 w-3.5" />
              </button>
            </SimpleTooltip>

            {isCanvasAvailable && (
              <SimpleTooltip text="Open in canvas to edit">
                <button
                  type="button"
                  aria-label="Open in canvas to edit"
                  onClick={handleOpenCanvas}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
              </SimpleTooltip>
            )}
          </div>
        )}
      </div>

      <MermaidRenderer
        source={source}
        options={renderOptions}
        isStreamActive={isStreamActive}
        onSvgMounted={setSvgEl}
        viewportMaxHeight={frameMaxHeight}
      />

      {showSource && !isStreamActive && (
        <div className="border-t border-border">
          <Suspense fallback={<MatrxMiniLoader />}>
            <CodeBlock code={source} language="mermaid" fontSize={13} />
          </Suspense>
        </div>
      )}

      {fullscreen && (
        <MermaidFullscreen
          source={source}
          options={renderOptions}
          title={title ?? catalog.label}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
};

export default MermaidBlock;
