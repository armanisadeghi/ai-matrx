"use client";

/**
 * Registers every canvas content type as an `@ai-matrx/canvas` kind. The
 * Record over CanvasContentType makes this exhaustive: a new content type
 * that is not registered here is a type error, never a tab that cannot render.
 */

import {
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  ChefHat,
  ClipboardList,
  Cloud,
  Code,
  Columns3,
  Eye,
  FileCode,
  FileDiff,
  FileText,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Layers,
  LayoutList,
  ListChecks,
  ListTree,
  Map as MapIcon,
  Network,
  Presentation,
  Shapes,
  Table,
  Terminal,
  Bug,
  Timer,
  Wrench,
  Workflow,
  Captions,
  Share2,
  LayoutDashboard,
  Database,
  Copy,
  Download,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { TapTargetButtonTransparent } from "@ai-matrx/design-system/tap-target";
import {
  defineCanvasKind,
  registerCanvasKinds,
  type AnyCanvasKind,
  type CanvasKindProps,
  type CanvasMenuItem,
} from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminDebugger } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { copyHtmlSource, downloadHtmlSource, resolveShownHtml } from "@/features/html-pages/output/htmlSourceOutput";
import { extractTitleFromHTML } from "@/features/html-pages/utils/html-title";
import {
  getDefaultTitle,
  isPersistableCanvasType,
  type CanvasContent,
  titleToString,
  type CanvasContentType,
} from "@/features/canvas/canvasContent";
import { canvasContentHasSource } from "@/features/canvas/core/canvasSource";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { artifactPrinterFor } from "@/features/canvas/output/canvasOutputPorts";
import { artifactOutputDef } from "@/features/canvas/artifact-types/artifact-output";
import { iframeBlockUrl } from "@/features/canvas/output/framePrinters";
import { artifactKey, contentOf, readArtifactItemData, type ArtifactItemData } from "./artifactItem";
import { openArtifactPanel, toggleArtifactPanel, useArtifactPanel } from "./artifactPanels";

const ICONS: Record<CanvasContentType, LucideIcon> = {
  quiz: ListChecks,
  presentation: Presentation,
  iframe: Globe,
  html: FileCode,
  code: Code,
  image: ImageIcon,
  diagram: Network,
  comparison: Columns3,
  timeline: Timer,
  research: BookOpen,
  troubleshooting: Wrench,
  "decision-tree": GitBranch,
  flashcards: Layers,
  recipe: ChefHat,
  resources: LayoutList,
  code_preview: FileCode,
  code_edit_error: FileCode,
  progress: ClipboardList,
  math_problem: Calculator,
  mermaid: Workflow,
  svg: Shapes,
  chart: BarChart3,
  map: MapIcon,
  stats: BarChart3,
  diff: FileDiff,
  questionnaire: ClipboardList,
  react: Code,
  table: Table,
  transcript: Captions,
  structured_info: FileText,
  tree: ListTree,
  tasks: ListChecks,
  cloud_browser: Cloud,
  udt_document: FileText,
  sandbox: Terminal,
  topical_map: Brain,
  kind_value: Database,
};

/**
 * Live surfaces whose body is a running session (a pty, a browser run, an
 * editor with callbacks) cannot come back after a reload. Pointer surfaces
 * (documents, topical maps) can — their truth is a row.
 */
const NOT_RESTORABLE: ReadonlySet<CanvasContentType> = new Set([
  "code_preview",
  "code_edit_error",
  "cloud_browser",
  "sandbox",
]);

const loadView = () => import("./ArtifactCanvasView");

function ArtifactHeaderAction({ item, canvas }: CanvasKindProps) {
  const isAdmin = useAppSelector(selectIsAdminDebugger);
  const panel = useArtifactPanel(item.id);
  const data = readArtifactItemData(item.data);
  if (!data) return null;
  const hasSource = canvasContentHasSource(contentOf(data));
  const showingSource = data.view === "source";
  return (
    <>
      {hasSource ? (
        <TapTargetButtonTransparent
          ariaLabel={showingSource ? "Show preview" : "Show source"}
          icon={showingSource ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
          onClick={() => canvas.update(item.id, { data: { ...data, view: showingSource ? "preview" : "source" } })}
        />
      ) : null}
      {isAdmin ? (
        <TapTargetButtonTransparent
          ariaLabel={panel === "debug" ? "Hide artifact debug" : "Artifact debug"}
          icon={<Bug className={panel === "debug" ? "h-4 w-4 text-amber-600 dark:text-amber-400" : "h-4 w-4"} />}
          onClick={() => toggleArtifactPanel(item.id, "debug")}
        />
      ) : null}
    </>
  );
}

async function saveToCloud(props: CanvasKindProps, data: ArtifactItemData) {
  const content = contentOf(data);
  const { syncCanvasItemToCloud } = await import("@/features/canvas/materialization/syncCanvasItemToCloud");
  const title = titleToString(content.metadata?.title) || getDefaultTitle(content.type);
  const outcome = await syncCanvasItemToCloud({
    content,
    item: { savedItemId: data.savedItemId ?? undefined },
    title,
  });
  if (!outcome.ok) {
    toast.error(outcome.error);
    return;
  }
  const artifactId = outcome.result.artifactId;
  if (artifactId) {
    const next: CanvasJson = { ...data, savedItemId: artifactId };
    props.canvas.update(props.item.id, { data: next });
    // The tab now IS that artifact: give it the artifact's identity, so opening
    // the saved artifact from anywhere focuses this tab instead of a second one.
    props.canvas.rekey(props.item.id, artifactKey(content, artifactId));
  }
  toast.success(outcome.result.wasCreated ? "Saved to the cloud" : "Already saved");
}

/** Copy HTML / Download .html for an html tab — the card's own path (htmlSourceOutput), the chain's latest version. */
function htmlSourceEntries(content: CanvasContent, data: ArtifactItemData): CanvasMenuItem[] {
  const held = typeof content.data === "string" ? content.data : ((content.data as { html?: string } | null)?.html ?? "");
  const canvasItemId = content.metadata?.canvasItemId ?? data.savedItemId ?? null;
  const title = (html: string) => extractTitleFromHTML(html) || titleToString(content.metadata?.title) || "Web page";
  const failed = (error: unknown) => {
    console.error("[canvas] the page's HTML could not be read", error);
    toast.error("The page's HTML could not be read.");
  };
  const shown = () => resolveShownHtml({ canvasItemId, version: "latest", held });
  return [
    {
      id: "html:copy",
      label: "Copy HTML",
      icon: <Copy />,
      onSelect: () => void shown().then(copyHtmlSource).catch(failed),
    },
    {
      id: "html:download",
      label: "Download .html",
      icon: <Download />,
      onSelect: () => void shown().then((html) => downloadHtmlSource(title(html), html)).catch(failed),
    },
  ];
}

/** The type's other print variants (a quiz: with answers, answer key) beside the pane's standard Print. */
function printVariantEntries(props: CanvasKindProps): CanvasMenuItem[] {
  const registered = artifactPrinterFor({ item: props.item });
  if (!registered) return [];
  const { printer, data } = registered;
  return (printer.variants ?? []).slice(1).map((variant) => ({
    id: `output:print:${variant.id}`,
    label: `Print — ${variant.label}`,
    onSelect: () => void printer.print(data, variant.id),
  }));
}

function artifactMenu(props: CanvasKindProps): readonly CanvasMenuItem[] {
  const data = readArtifactItemData(props.item.data);
  if (!data) return [];
  const content = contentOf(data);
  return [
    ...printVariantEntries(props),
    ...(content.type === "html" ? htmlSourceEntries(content, data) : []),
    ...(content.type === "iframe" ? embeddedSiteEntries(content) : []),
    ...persistEntries(props, data, content),
  ];
}

/** An embedded site cannot be printed or captured here (another origin) — the way to it is opening it. */
function embeddedSiteEntries(content: CanvasContent): CanvasMenuItem[] {
  const url = iframeBlockUrl(content.data);
  if (!url) return [];
  return [{ id: "open-site", label: "Open site", icon: <ExternalLink />, onSelect: () => window.open(url, "_blank", "noopener") }];
}

function persistEntries(props: CanvasKindProps, data: ArtifactItemData, content: CanvasContent): CanvasMenuItem[] {
  if (!isPersistableCanvasType(content.type)) return [];
  const savedId = content.metadata?.canvasItemId ?? data.savedItemId;
  const saved = isMaterializedArtifactId(savedId);
  const entries: CanvasMenuItem[] = [];
  if (!saved) {
    entries.push({ id: "save", label: "Save to cloud", icon: <Cloud />, onSelect: () => void saveToCloud(props, data) });
  }
  if (saved && savedId) {
    entries.push({
      id: "open-page",
      label: "Open full page",
      icon: <Globe />,
      onSelect: () => window.open(`/artifacts/${savedId}`, "_blank", "noopener"),
    });
  }
  entries.push({ id: "share", label: "Share", icon: <Share2 />, onSelect: () => openArtifactPanel(props.item.id, "share") });
  return entries;
}

export const ARTIFACT_CANVAS_KINDS: readonly AnyCanvasKind[] = (Object.keys(ICONS) as CanvasContentType[]).map((type) =>
  defineCanvasKind<CanvasJson>({
    id: type,
    // What its body is and how it prints / captures — on the artifact TYPE (artifact-output.ts).
    ...artifactOutputDef(type),
    label: getDefaultTitle(type),
    icon: ICONS[type],
    load: loadView,
    title: (data) => {
      const parsed = readArtifactItemData(data);
      const title = parsed ? titleToString(contentOf(parsed).metadata?.title) : "";
      return title || getDefaultTitle(type);
    },
    restore: !NOT_RESTORABLE.has(type),
    HeaderAction: ArtifactHeaderAction,
    menuItems: artifactMenu,
  }),
);

/**
 * The person's saved canvas items, as a tab. Offered in an empty pane's
 * launcher, so an empty canvas always has somewhere to go.
 */
export const SAVED_ITEMS_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<null>({
  id: "saved-items",
  surface: "dom",
  // A launcher grid (virtualized, with menus): its items print from their own tabs (kindOutputDecisions.ts).
  print: false,
  label: "Saved",
  icon: LayoutDashboard,
  load: () =>
    import("@/features/canvas/core/SavedCanvasItems").then((m) => ({
      default: m.SavedCanvasItems,
    })),
  title: () => "Saved items",
  restore: true,
  launcher: { key: "default", data: null, title: "Saved items" },
});

export function registerArtifactCanvasKinds(): () => void {
  return registerCanvasKinds([...ARTIFACT_CANVAS_KINDS, SAVED_ITEMS_CANVAS_KIND]);
}
