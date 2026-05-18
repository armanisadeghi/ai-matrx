"use client";

/**
 * Edit mode — full-featured image editor.
 *
 * Wraps `react-filerobot-image-editor` (5.0.1) which gives us in one
 * component: crop, rotate, flip, resize, fine-tune (brightness/contrast/HSV/
 * warmth/blur/threshold/posterize/pixelate/noise), filters, freehand pen,
 * shapes (rect/ellipse/polygon/line/arrow), text, watermark.
 *
 * On top of Filerobot's native toolbar we layer four AI assists:
 *   • ✨ Suggest edits  → `image-suggest-edits` agent
 *   • Background remove → `bg-remove` Python endpoint
 *   • Upscale (2× / 4×) → `upscale` Python endpoint
 *   • Generate variant  → `image-edit` (instruction prompt) endpoint
 *
 * All AI helpers consume + produce cloud_file_ids — when one returns, the
 * editor reloads its source from the result so the user can keep editing.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Loader2, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useImageSource } from "../shared/use-image-source";
import { saveEditedImage } from "../shared/save-edited-image";
import type { ModeShellProps } from "../shared/types";
import { EditAiToolbar } from "./EditAiToolbar";
import { installThirdPartyNoiseFilter } from "@/lib/console-noise";

// Filerobot 5.0.1 ships THREE files (HistoryButtons.js, TabsResponsive.js,
// TabsNavbar/index.js) whose compiled output calls `React.createElement(...)`
// without an `import React from "react"` at the top — almost certainly a
// regression in their build. Next.js's `transpilePackages` can't repair it
// because there's no import to preserve. Polyfill `React` on `globalThis`
// before the Filerobot bundle loads so those bare calls resolve. Cheap +
// localized to the Edit mode loader, gone the day Filerobot fixes the issue.
//
// Same vintage of build bug: those files also spread `active={boolean}` onto
// a DOM <button>, which triggers React's "non-boolean attribute" dev warning
// on every render. Suppress it via the shared third-party-noise filter
// (lib/console-noise.ts) — stack-checked so it only swallows warnings whose
// call originates inside react-filerobot-image-editor, never our own code.
const FilerobotImageEditor = dynamic(
  async () => {
    const ReactNs = await import("react");
    const ReactDefault =
      (ReactNs as unknown as { default?: typeof ReactNs }).default ?? ReactNs;
    (globalThis as unknown as { React?: unknown }).React = ReactDefault;
    installThirdPartyNoiseFilter();
    return import("react-filerobot-image-editor");
  },
  { ssr: false, loading: () => <EditorSkeleton /> },
);

interface SavedImage {
  imageBase64?: string;
  fullName?: string;
  mimeType: string;
  extension: string;
  name: string;
}

const EDIT_FOLDER = "Images/Edited";

export function EditModeShell({
  source,
  cloudFileId,
  defaultFolder = EDIT_FOLDER,
  presentation = "page",
  onSave,
  onCancel,
}: ModeShellProps) {
  const { url, filename } = useImageSource(source);
  const themeMode = useThemeMode();
  const [saving, setSaving] = useState(false);
  // Allows AI ops to swap the underlying source mid-edit. We bump a key to
  // force-remount Filerobot when this changes (it's not designed to react
  // to a runtime `source` prop change).
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [overrideFilename, setOverrideFilename] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeUrl = overrideUrl ?? url;
  const activeFilename = overrideFilename ?? filename;

  const handleAiResult = useCallback((newUrl: string, newName: string) => {
    setOverrideUrl(newUrl);
    setOverrideFilename(newName);
    setReloadKey((k) => k + 1);
    toast.success("AI result loaded into the editor.");
  }, []);

  const handleSave = useCallback(
    async (saved: SavedImage) => {
      if (!saved.imageBase64) {
        toast.error("Editor returned no image data.");
        return;
      }
      setSaving(true);
      try {
        const blob = base64ToBlob(saved.imageBase64, saved.mimeType);
        const result = await saveEditedImage({
          blob,
          filename: saved.fullName ?? `${saved.name}.${saved.extension}`,
          folderPath: defaultFolder,
          mime: saved.mimeType,
          metadata: { kind: "edit", source_filename: filename },
        });
        toast.success("Saved.");
        onSave?.(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [defaultFolder, filename, onSave],
  );

  // Filerobot's onSave is sync but our save is async — fire and forget,
  // we surface progress via toasts + the saving state.
  const onFilerobotSave = useCallback(
    (saved: SavedImage) => {
      void handleSave(saved);
    },
    [handleSave],
  );

  if (!activeUrl) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        No image loaded. Pass a <code className="mx-1">?url=</code> or{" "}
        <code className="mx-1">?file=</code> query parameter, or open this from
        a Cloud Files row.
      </div>
    );
  }

  const stem = stripExt(activeFilename);

  const isDark = themeMode === "dark";
  const activeTheme = isDark ? darkTheme : lightTheme;
  // Filerobot doesn't watch `theme` deeply — combine the theme mode into the
  // key so a light↔dark toggle force-remounts the editor with a clean theme
  // application.
  const editorKey = `${themeMode}-${reloadKey}`;

  return (
    <div className="h-full min-h-0 flex flex-col bg-background">
      <EditAiToolbar
        sourceCloudFileId={
          cloudFileId ??
          (source?.kind === "cloudFileId" ? source.cloudFileId : null)
        }
        sourceUrl={activeUrl}
        onResult={handleAiResult}
      />
      <div className="flex-1 min-h-0 relative">
        <FilerobotImageEditor
          key={editorKey}
          source={activeUrl}
          theme={activeTheme}
          previewBgColor={isDark ? "#27272a" : "#f4f4f6"}
          onSave={onFilerobotSave}
          onClose={() => onCancel?.()}
          defaultSavedImageName={`${stem}-edited`}
          defaultSavedImageType="png"
          defaultSavedImageQuality={0.95}
          savingPixelRatio={2}
          previewPixelRatio={1}
          showBackButton={presentation === "modal"}
          avoidChangesNotSavedAlertOnLeave={false}
          // Skip the Scaleflex CDN translations fetch — we ship in English
          // and don't need their backend lookup hitting the network.
          useBackendTranslations={false}
          tabsIds={[
            "Adjust",
            "Finetune",
            "Filters",
            "Annotate",
            "Watermark",
            "Resize",
          ]}
          defaultTabId="Adjust"
          defaultToolId="Crop"
        />
        {saving && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-50">
            <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-card border border-border shadow">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Saving…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="h-full p-4 flex flex-col gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="flex-1 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

function base64ToBlob(base64DataUrl: string, mime: string): Blob {
  const commaIdx = base64DataUrl.indexOf(",");
  const data =
    commaIdx >= 0 ? base64DataUrl.slice(commaIdx + 1) : base64DataUrl;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Filerobot theme overrides — pinned 1:1 to the codebase design tokens.
 *
 * SOURCE: app/globals.css (`:root` for light, `.dark` for dark).
 * The codebase uses the zinc scale + primary blue. Every value below is the
 * hex equivalent of a `--token` defined in globals.css — keep this in sync
 * if globals.css changes.
 *
 * Filerobot's `theme.palette` reads from TWO key namespaces:
 *   1. Filerobot shorthand keys (`bg-secondary`, `accent-primary`, …) drive
 *      the editor chrome.
 *   2. `@scaleflex/ui` Color enum keys (`bg-stateless`, `bg-active`, `bg-hover`,
 *      `txt-primary`, …) drive the embedded menus (crop ratio dropdown, etc.).
 * Both namespaces must be set together — skip one and inner menus revert to
 * defaults and clash with the chrome.
 *
 * Filerobot doesn't accept CSS `var(...)` (it does brightness math on the
 * raw values), so we reify the HSL tokens to hex here.
 */

// LIGHT — mirrors :root in app/globals.css
//   --background      240  5% 96%   → #f4f4f6   (zinc-100-ish)
//   --foreground      240  4% 16%   → #27272a   (zinc-850)
//   --card              0  0% 100%  → #ffffff
//   --muted           240  5% 92%   → #e9e9ec
//   --muted-foreground 240 5% 35%   → #56565d
//   --accent          240  5% 94%   → #efeff1   (zinc-150)
//   --primary         210 80% 45%   → #1773ce   (codebase blue)
//   --border          240  6% 85%   → #d8d8db   (zinc-300)
//   --input           240  6% 90%   → #e5e5e8
const lightTheme = {
  palette: {
    // ── Filerobot shorthand keys (editor chrome) ──
    "bg-primary": "#ffffff", // --card
    "bg-primary-active": "#1773ce", // --primary
    "bg-secondary": "#f4f4f6", // --background
    "accent-primary": "#1773ce", // --primary
    "accent-primary-active": "#125ea8", // --primary darker
    "icons-primary": "#27272a", // --foreground
    "icons-secondary": "#56565d", // --muted-foreground
    "borders-primary": "#d8d8db", // --border
    "borders-secondary": "#efeff1", // --accent
    "borders-strong": "#a1a1a8", // zinc-400
    "light-shadow": "rgba(39, 39, 42, 0.08)",
    "warning-primary": "#f59e0b", // --warning
    // ── @scaleflex/ui Color enum keys (embedded menus) ──
    "bg-stateless": "#ffffff", // --card
    "bg-active": "#1773ce", // --primary
    "bg-hover": "#efeff1", // --accent
    "bg-base-light": "#f9f9fa",
    "bg-base-medium": "#efeff1", // --accent
    "bg-grey": "#e9e9ec", // --muted
    "bg-tooltip": "#27272a", // --foreground
    "txt-primary": "#27272a", // --foreground
    "txt-secondary": "#56565d", // --muted-foreground
    "txt-secondary-invert": "#ffffff",
    "txt-placeholder": "#a1a1a8",
    "icon-primary": "#27272a", // --foreground
    "icons-placeholder": "#a1a1a8",
    "icons-invert": "#ffffff",
    "icons-muted": "#d8d8db", // --border
    "btn-primary-text": "#ffffff", // --primary-foreground
    "accent-primary-hover": "#125ea8",
  },
  typography: {
    fontFamily:
      'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
};

// DARK — mirrors .dark in app/globals.css
//   --background      240  4% 16%   → #27272a   (zinc-850)
//   --foreground      240  5% 90%   → #e4e4e7   (zinc-200)
//   --card            240  5% 20%   → #313135   (zinc-800)
//   --popover         240  5% 18%   → #2c2c30
//   --muted           240  4% 24%   → #3a3a3e
//   --muted-foreground 240 5% 80%   → #c9c9cd
//   --accent          240  4% 24%   → #3a3a3e
//   --primary         221 83% 53%   → #2563eb   (Tailwind blue-600)
//   --border          240  4% 30%   → #48484e   (zinc-700/750)
//   --input           240  4% 28%   → #434348
const darkTheme = {
  palette: {
    // ── Filerobot shorthand keys (editor chrome) ──
    "bg-primary": "#313135", // --card
    "bg-primary-active": "#2563eb", // --primary
    "bg-secondary": "#27272a", // --background
    "accent-primary": "#2563eb", // --primary
    "accent-primary-active": "#1d4ed8", // --primary darker
    "icons-primary": "#e4e4e7", // --foreground
    "icons-secondary": "#c9c9cd", // --muted-foreground
    "borders-primary": "#48484e", // --border
    "borders-secondary": "#3a3a3e", // --muted/accent
    "borders-strong": "#5a5a60",
    "light-shadow": "rgba(0, 0, 0, 0.4)",
    "warning-primary": "#facc15", // dark --warning
    // ── @scaleflex/ui Color enum keys (embedded menus) ──
    "bg-stateless": "#313135", // --card
    "bg-active": "#3a3a3e", // --accent
    "bg-hover": "#3a3a3e", // --accent
    "bg-base-light": "#3a3a3e",
    "bg-base-medium": "#27272a", // --background
    "bg-grey": "#3a3a3e", // --muted
    "bg-tooltip": "#18181b", // zinc-900
    "txt-primary": "#e4e4e7", // --foreground
    "txt-secondary": "#c9c9cd", // --muted-foreground
    "txt-secondary-invert": "#27272a",
    "txt-placeholder": "#7c7c84",
    "icon-primary": "#e4e4e7", // --foreground
    "icons-placeholder": "#7c7c84",
    "icons-invert": "#27272a",
    "icons-muted": "#48484e", // --border
    "btn-primary-text": "#ffffff", // --primary-foreground
    "accent-primary-hover": "#1d4ed8",
  },
  typography: {
    fontFamily:
      'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
};

// Re-export the close button trio so the modal-mode wrapper can render its
// own header without duplicating styles.
export { Sparkles, Save, X };

// Track dark/light by reading the `dark` class on <html>. Mirrors the
// pattern used by `components/ui/sonner.tsx` so we don't pull in
// next-themes for a single boolean.
function useThemeMode(): "light" | "dark" {
  return useSyncExternalStore<"light" | "dark">(
    (onChange) => {
      if (typeof document === "undefined") return () => {};
      const obs = new MutationObserver(onChange);
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => obs.disconnect();
    },
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
    () => "dark",
  );
}
