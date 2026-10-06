/**
 * The app-owned modules a STORED component's scope needs (kind components,
 * Applets, tool and emit renderers), handed to `@ai-matrx/code-runtime`'s ONE
 * documented registry. Nothing here decides what stored code may import — the
 * package's registry does — this only says where each host-owned module lives.
 *
 * `@/components/ui/*` are supplied from the app's own files so stored code
 * renders exactly as the app's screens do (most re-export the design system;
 * the eight that still wrap it fold into the design system later).
 *
 * Shared by the page and the kind sandbox frame: the frame's esbuild aliases
 * swap MarkdownStream, CopyForAiButton and `@/applets` for frame-safe twins at
 * bundle time, so this file never knows which world it is in. It must stay
 * free of async `import()` (the frame bundle has no code splitting).
 */
import { provideScopeModules } from "@ai-matrx/code-runtime/scope";

let provided = false;

/** Idempotent: call before any compile. */
export function provideStoredComponentScopeModules(): void {
  if (provided) return;
  provided = true;
  const markdown = () => require("@/components/MarkdownStream");
  provideScopeModules({
    "@/components/MarkdownStream": markdown,
    "@/components/Markdown": markdown,
    "@/components/markdown": markdown,
    "@/components/mardown": markdown,
    "@/components/agent-copy/CopyButtons": () => require("@/components/agent-copy/CopyButtons"),
    "@/components/agent-copy/CopyForAiButton": () => require("@/components/agent-copy/CopyForAiButton"),
    "@/components/kind-kit/SortableList": () => require("@/components/kind-kit/SortableList"),
    "@/components/kind-kit/KindPanelGrid": () => require("@/components/kind-kit/KindPanelGrid"),
    "@/components/kind-kit/KindPanel": () => require("@/components/kind-kit/KindPanel"),
    "@/components/kind-kit/KindHeaderBar": () => require("@/components/kind-kit/KindHeaderBar"),
    "@/components/kind-kit/StreamingSkeleton": () => require("@/components/kind-kit/StreamingSkeleton"),
    "@/components/kind-kit/TagList": () => require("@/components/kind-kit/TagList"),
    "@/applets": () => require("@/features/agent-apps/embed/AppletParts"),
    "@/lib/utils": () => require("@/lib/utils"),
    "@/components/ui/button": () => require("@/components/ui/button"),
    "@/components/ui/textarea": () => require("@/components/ui/textarea"),
    "@/components/ui/card": () => require("@/components/ui/card"),
    "@/components/ui/label": () => require("@/components/ui/label"),
    "@/components/ui/select": () => require("@/components/ui/select"),
    "@/components/ui/slider": () => require("@/components/ui/slider"),
    "@/components/ui/switch": () => require("@/components/ui/switch"),
    "@/components/ui/tabs": () => require("@/components/ui/tabs"),
    "@/components/ui/badge": () => require("@/components/ui/badge"),
    "@/components/ui/tooltip": () => require("@/components/ui/tooltip"),
    "@/components/ui/accordion": () => require("@/components/ui/accordion"),
    "@/components/ui/collapsible": () => require("@/components/ui/collapsible"),
    "@/components/ui/progress": () => require("@/components/ui/progress"),
    "@/components/ui/separator": () => require("@/components/ui/separator"),
    "@/components/ui/scroll-area": () => require("@/components/ui/scroll-area"),
    "@/components/ui/dialog": () => require("@/components/ui/dialog"),
    "@/components/ui/dropdown-menu": () => require("@/components/ui/dropdown-menu"),
    "@/components/ui/table": () => require("@/components/ui/table"),
    "@/components/ui/checkbox": () => require("@/components/ui/checkbox"),
    "@/components/ui/radio-group": () => require("@/components/ui/radio-group"),
    "@/components/ui/avatar": () => require("@/components/ui/avatar"),
    "@/components/ui/alert": () => require("@/components/ui/alert"),
    // input, sheet, popover and skeleton have no app export of that name: the
    // package's design-system default serves them (as the old registry did).
    recharts: () => require("recharts"),
  });
}
