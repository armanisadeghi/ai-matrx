"use client";

/**
 * Edit mode — full-featured image editor.
 *
 * Wraps `react-filerobot-image-editor` (5.0.1) which gives us in one
 * component: crop, rotate, flip, resize, fine-tune (brightness/contrast/HSV/
 * warmth/blur/threshold/posterize/pixelate/noise), filters, freehand pen,
 * shapes (rect/ellipse/polygon/line/arrow), text, watermark.
 *
 * Overlaid on top of Filerobot:
 *   • A header strip with file name, back, save-as-duplicate, generate-sizes
 *     dropdown, mask toggle, and history toggle.
 *   • AI assists (BG remove / upscale / AI edit) — see EditAiToolbar.
 *   • A right-rail Versions list (collapsible, localStorage-persisted).
 *   • A mask painting overlay above Filerobot's image area.
 *
 * The editor always operates on a cloudFileId — the /[id] route guarantees
 * it. Saving replaces the existing file (creates a new version) by default;
 * "Save as duplicate" creates a fresh file.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  Copy,
  History,
  Layers,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileName } from "@/features/files/redux/selectors";
import { FileVersionsList } from "@/features/files/components/core/FileVersions/FileVersionsList";
import { addAssetVariants } from "@/features/files/api/assets";
import type { AssetPreset } from "@/features/files/types";
import { useImageSource } from "../shared/use-image-source";
import { saveEditedImage } from "../shared/save-edited-image";
import type { ModeShellProps } from "../shared/types";
import { EditAiToolbar } from "./EditAiToolbar";
import { MaskOverlay } from "./MaskOverlay";
import { useMaskState } from "./use-mask-state";
import { installThirdPartyNoiseFilter } from "@/lib/console-noise";

// Filerobot 5.0.1 ships THREE files (HistoryButtons.js, TabsResponsive.js,
// TabsNavbar/index.js) whose compiled output calls `React.createElement(...)`
// without an `import React from "react"` at the top — almost certainly a
// regression in their build. Next.js's `transpilePackages` can't repair it
// because there's no import to preserve. Polyfill `React` on `globalThis`
// before the Filerobot bundle loads so those bare calls resolve.
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
const RAIL_LS_KEY = "image-edit.versions-rail-open";

const VARIANT_PRESETS: { id: AssetPreset; label: string; blurb: string }[] = [
  { id: "web", label: "Web", blurb: "Hero, OG, card, touch icon, PWA, thumb" },
  { id: "social", label: "Social", blurb: "OG, square, portrait, story, YT thumb" },
  { id: "email", label: "Email", blurb: "1200×400 header + 1080² square" },
  { id: "avatar", label: "Avatar", blurb: "400², 200², 96², 48², 24²" },
  { id: "favicon", label: "Favicon", blurb: "192, 180, 32, 16 px favicons" },
];

export function EditModeShell({
  source,
  cloudFileId,
  defaultFolder = EDIT_FOLDER,
  presentation = "page",
  onSave,
  onCancel,
}: ModeShellProps) {
  const router = useRouter();
  const { url, filename } = useImageSource(source);
  const themeMode = useThemeMode();
  const [saving, setSaving] = useState(false);
  const [savingVariants, setSavingVariants] = useState<AssetPreset | null>(null);

  // Allows AI ops + version-restore to swap the underlying source mid-edit.
  // We bump a key to force-remount Filerobot when this changes.
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [overrideFilename, setOverrideFilename] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeUrl = overrideUrl ?? url;
  const activeFilename = overrideFilename ?? filename;

  const effectiveCloudFileId =
    cloudFileId ??
    (source?.kind === "cloudFileId" ? source.cloudFileId : null);

  // Use the Redux file name when available so it stays in sync with renames.
  const reduxFileName = useAppSelector((s) =>
    effectiveCloudFileId ? selectFileName(s, effectiveCloudFileId) : null,
  );
  const displayName = reduxFileName ?? activeFilename;

  // Save mode flag (read by the Filerobot save handler). Tracked via ref so
  // setting it from a menu click doesn't re-render Filerobot underneath us.
  const nextSaveModeRef = useRef<"version" | "new">("version");

  // Versions rail — open by default, persisted to localStorage.
  const [railOpen, setRailOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(RAIL_LS_KEY);
    return stored === null ? true : stored === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RAIL_LS_KEY, railOpen ? "1" : "0");
  }, [railOpen]);

  // Mask state.
  const mask = useMaskState();

  // Editor canvas area ref — mask overlay positions itself over this.
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);

  const handleAiResult = useCallback((newUrl: string, newName: string) => {
    setOverrideUrl(newUrl);
    setOverrideFilename(newName);
    setReloadKey((k) => k + 1);
    mask.clear();
    toast.success("AI result loaded into the editor.");
  }, [mask]);

  const handleVersionRestored = useCallback(() => {
    setReloadKey((k) => k + 1);
    setOverrideUrl(null);
    setOverrideFilename(null);
    toast.success("Version restored. Editor reloaded.");
  }, []);

  const handleSave = useCallback(
    async (saved: SavedImage) => {
      if (!saved.imageBase64) {
        toast.error("Editor returned no image data.");
        return;
      }
      setSaving(true);
      const mode = nextSaveModeRef.current;
      nextSaveModeRef.current = "version"; // reset for the next click
      try {
        const blob = base64ToBlob(saved.imageBase64, saved.mimeType);
        const result = await saveEditedImage({
          blob,
          filename: saved.fullName ?? `${saved.name}.${saved.extension}`,
          folderPath: defaultFolder,
          mime: saved.mimeType,
          metadata: { kind: "edit", source_filename: filename },
          fileId:
            mode === "version" && effectiveCloudFileId
              ? effectiveCloudFileId
              : undefined,
          changeSummary: mode === "version" ? "Edited in Image Studio" : undefined,
        });
        if (mode === "version") {
          toast.success("Saved as new version.");
        } else {
          toast.success("Saved as a new file.");
        }
        // If we created a NEW file (Save as duplicate) and we're on a page
        // route, navigate to the new file's editor so the URL reflects the
        // canonical file the user is now editing.
        if (mode === "new" && presentation === "page" && result.fileId) {
          router.replace(`/images/edit/${result.fileId}`);
        }
        onSave?.(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [defaultFolder, filename, effectiveCloudFileId, onSave, presentation, router],
  );

  // Filerobot's onSave is sync but our save is async — fire and forget,
  // we surface progress via toasts + the saving state.
  const onFilerobotSave = useCallback(
    (saved: SavedImage) => {
      void handleSave(saved);
    },
    [handleSave],
  );

  // Programmatically trigger Filerobot's built-in save button. Used by our
  // header "Save" and "Save as duplicate" actions so the user has one
  // consistent surface to commit edits.
  const triggerFilerobotSave = useCallback(() => {
    if (!canvasAreaRef.current) return false;
    // Filerobot exposes its save under data-tut="save" + visible "Save" text;
    // we try both selectors and a text-content fallback so we're resilient to
    // class-name churn between Filerobot versions.
    const root = canvasAreaRef.current;
    const candidates = [
      root.querySelector<HTMLElement>('[data-tut="save"] button'),
      root.querySelector<HTMLElement>('[data-tut="save"]'),
      root.querySelector<HTMLElement>(".FIE_topbar-save-button"),
    ].filter(Boolean) as HTMLElement[];
    let target: HTMLElement | null = candidates[0] ?? null;
    if (!target) {
      const buttons = root.querySelectorAll<HTMLElement>("button");
      buttons.forEach((b) => {
        if (!target && /^\s*Save\s*$/.test(b.textContent ?? "")) target = b;
      });
    }
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, []);

  const handleHeaderSave = useCallback(() => {
    nextSaveModeRef.current = "version";
    if (!triggerFilerobotSave()) {
      toast.info(
        "Open the editor's Save panel to commit the edit (couldn't find the internal save button).",
      );
    }
  }, [triggerFilerobotSave]);

  const handleSaveAsDuplicate = useCallback(() => {
    nextSaveModeRef.current = "new";
    if (!triggerFilerobotSave()) {
      nextSaveModeRef.current = "version";
      toast.info("Open the editor's Save panel to commit the duplicate.");
    }
  }, [triggerFilerobotSave]);

  const handleGenerateVariants = useCallback(
    async (preset: AssetPreset) => {
      if (!effectiveCloudFileId) {
        toast.info("Save first, then we can render size variants.");
        return;
      }
      setSavingVariants(preset);
      try {
        await addAssetVariants(effectiveCloudFileId, { preset });
        toast.success(`${labelForPreset(preset)} variants generated.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Variant generation failed";
        toast.error(msg);
      } finally {
        setSavingVariants(null);
      }
    },
    [effectiveCloudFileId],
  );

  const handleBack = useCallback(() => {
    if (presentation === "modal") {
      onCancel?.();
      return;
    }
    router.back();
  }, [presentation, onCancel, router]);

  if (!activeUrl) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading image…
      </div>
    );
  }

  const stem = stripExt(activeFilename);
  const isDark = themeMode === "dark";
  const activeTheme = isDark ? darkTheme : lightTheme;
  const editorKey = `${themeMode}-${reloadKey}-${activeUrl}`;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="h-full min-h-0 flex flex-col bg-background"
        data-image-edit-shell
      >
        {/* ── Header strip ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/60 shrink-0">
          {presentation === "page" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleBack}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>
          ) : null}

          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            <span
              className="text-sm font-medium truncate"
              title={displayName}
            >
              {displayName}
            </span>
            {effectiveCloudFileId ? null : (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                Unsaved
              </span>
            )}
          </div>

          {/* Mask toggle — secondary (muted) when active so it doesn't fight
              the header's primary Save for attention. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={mask.active ? "secondary" : "ghost"}
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-foreground/80 hover:text-foreground"
                onClick={() => mask.toggle()}
              >
                <Layers className="h-3.5 w-3.5" />
                Mask
                {mask.hasPixels ? (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {mask.active
                ? "Mask painting on — click again to hide"
                : "Paint a mask to constrain AI ops"}
            </TooltipContent>
          </Tooltip>

          {/* Generate sizes dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-foreground/80 hover:text-foreground"
                disabled={!effectiveCloudFileId || savingVariants !== null}
              >
                {savingVariants ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Sizes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Generate sized variants</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {VARIANT_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => void handleGenerateVariants(p.id)}
                  disabled={savingVariants !== null}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{p.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.blurb}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="h-8 shrink-0 gap-1.5"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={handleHeaderSave}
                disabled={!effectiveCloudFileId}
              >
                <Save className="h-3.5 w-3.5 mr-2" />
                Save as new version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSaveAsDuplicate}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Save as duplicate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* History rail toggle — subtle "selected" state via accent. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={railOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 shrink-0 text-foreground/80 hover:text-foreground"
                onClick={() => setRailOpen((v) => !v)}
                disabled={!effectiveCloudFileId}
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {railOpen ? "Hide version history" : "Show version history"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── AI toolbar (relocated from sibling) ─────────────────────── */}
        <EditAiToolbar
          sourceCloudFileId={effectiveCloudFileId}
          sourceUrl={activeUrl}
          onResult={handleAiResult}
          mask={mask}
        />

        {/* ── Editor area + versions rail ─────────────────────────────── */}
        <div className="flex-1 min-h-0 flex">
          <div
            ref={canvasAreaRef}
            className="flex-1 min-w-0 min-h-0 relative"
          >
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
            <MaskOverlay
              canvasAreaRef={canvasAreaRef}
              mask={mask}
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

          {railOpen && effectiveCloudFileId ? (
            <aside className="w-72 shrink-0 border-l border-border bg-card flex flex-col min-h-0">
              <VersionsRail
                fileId={effectiveCloudFileId}
                onRestored={handleVersionRestored}
              />
            </aside>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

function VersionsRail({
  fileId,
  onRestored,
}: {
  fileId: string;
  onRestored: () => void;
}) {
  // FileVersionsList drives the actual list; we listen for restore by
  // diffing the Redux slice through a sentinel. The simplest robust
  // signal is to subscribe to the file's `version` field — when it
  // changes after a restore (or a save), bump the parent editor.
  const version = useAppSelector(
    (s) =>
      (s.cloudFiles?.filesById?.[fileId] as { version?: number } | undefined)
        ?.version ?? null,
  );
  const lastSeenRef = useRef<number | null>(version);
  useEffect(() => {
    if (version === null) return;
    if (lastSeenRef.current === null) {
      lastSeenRef.current = version;
      return;
    }
    if (version !== lastSeenRef.current) {
      lastSeenRef.current = version;
      onRestored();
    }
  }, [version, onRestored]);

  return <FileVersionsList fileId={fileId} className="min-h-0" />;
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

function labelForPreset(p: AssetPreset): string {
  const def = VARIANT_PRESETS.find((x) => x.id === p);
  return def?.label ?? String(p);
}

/**
 * Filerobot theme overrides — pinned 1:1 to the codebase design tokens.
 *
 * SOURCE: app/globals.css (`:root` for light, `.dark` for dark).
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

// Active states use the muted --accent (zinc-150) rather than saturated
// --primary blue. Filerobot active tabs/tools then read as "selected"
// without screaming. Reserve true primary blue for the one prominent
// header Save button.
const lightTheme = {
  palette: {
    "bg-primary": "#ffffff",
    "bg-primary-active": "#efeff1", // muted, was saturated blue
    "bg-secondary": "#f4f4f6",
    "accent-primary": "#27272a", // foreground for active-tab text
    "accent-primary-active": "#27272a",
    "icons-primary": "#27272a",
    "icons-secondary": "#56565d",
    "borders-primary": "#d8d8db",
    "borders-secondary": "#efeff1",
    "borders-strong": "#a1a1a8",
    "light-shadow": "rgba(39, 39, 42, 0.08)",
    "warning-primary": "#f59e0b",
    "bg-stateless": "#ffffff",
    "bg-active": "#efeff1", // muted
    "bg-hover": "#efeff1",
    "bg-base-light": "#f9f9fa",
    "bg-base-medium": "#efeff1",
    "bg-grey": "#e9e9ec",
    "bg-tooltip": "#27272a",
    "txt-primary": "#27272a",
    "txt-secondary": "#56565d",
    "txt-secondary-invert": "#27272a",
    "txt-placeholder": "#a1a1a8",
    "icon-primary": "#27272a",
    "icons-placeholder": "#a1a1a8",
    "icons-invert": "#27272a",
    "icons-muted": "#d8d8db",
    "btn-primary-text": "#27272a",
    "accent-primary-hover": "#e9e9ec",
  },
  typography: {
    fontFamily:
      'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
};

const darkTheme = {
  palette: {
    "bg-primary": "#313135",
    "bg-primary-active": "#3a3a3e", // muted, was saturated blue
    "bg-secondary": "#27272a",
    "accent-primary": "#e4e4e7", // light text on active background
    "accent-primary-active": "#e4e4e7",
    "icons-primary": "#e4e4e7",
    "icons-secondary": "#c9c9cd",
    "borders-primary": "#48484e",
    "borders-secondary": "#3a3a3e",
    "borders-strong": "#5a5a60",
    "light-shadow": "rgba(0, 0, 0, 0.4)",
    "warning-primary": "#facc15",
    "bg-stateless": "#313135",
    "bg-active": "#3a3a3e",
    "bg-hover": "#3a3a3e",
    "bg-base-light": "#3a3a3e",
    "bg-base-medium": "#27272a",
    "bg-grey": "#3a3a3e",
    "bg-tooltip": "#18181b",
    "txt-primary": "#e4e4e7",
    "txt-secondary": "#c9c9cd",
    "txt-secondary-invert": "#e4e4e7",
    "txt-placeholder": "#7c7c84",
    "icon-primary": "#e4e4e7",
    "icons-placeholder": "#7c7c84",
    "icons-invert": "#e4e4e7",
    "icons-muted": "#48484e",
    "btn-primary-text": "#e4e4e7",
    "accent-primary-hover": "#48484e",
  },
  typography: {
    fontFamily:
      'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
};

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
