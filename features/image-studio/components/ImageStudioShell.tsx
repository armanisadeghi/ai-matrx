"use client";

/**
 * ImageStudioShell
 *
 * The full interactive studio. Split into three columns:
 *   • Left   — PresetCatalog (search, bundles, categories)
 *   • Center — Drop zone + file cards with per-variant previews
 *   • Right  — ExportPanel (format, quality, generate/download/save actions)
 *
 * The whole thing is a client component; route wrappers render this inside a
 * server shell so the static header and grid structure are SSR-rendered for
 * zero layout shift.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "@/lib/toast";
import { PresetCatalog } from "./PresetCatalog";
import dynamic from "next/dynamic";
import { StudioDropZone } from "./StudioDropZone";
import { StudioFileCard } from "./StudioFileCard";
import { ExportPanel } from "./ExportPanel";

// Both crop windows render <WindowPanel> as styling chrome but are not
// registered overlays — File[] blobs and (files: File[]) => void
// callbacks can't survive Redux serialization. `dynamic()` keeps
// WindowPanel out of the route's static graph (otherwise every route
// that lazy-loads the image-studio bundle pulls in the whole
// window-panels chunk). `loading: null` because both windows are
// conditionally rendered (only when the user actively crops) — first
// paint without them is correct.
const CropPreviewWindow = dynamic(
  () =>
    import("./CropPreviewWindow").then((m) => ({
      default: m.CropPreviewWindow,
    })),
  { ssr: false, loading: () => null },
);
const InitialCropWindow = dynamic(
  () =>
    import("./InitialCropWindow").then((m) => ({
      default: m.InitialCropWindow,
    })),
  { ssr: false, loading: () => null },
);
import { useImageStudio } from "../hooks/useImageStudio";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { IMAGE_STUDIO_SURFACE_NAME } from "@/features/surfaces/manifests/image-studio.manifest";
import {
  downloadVariantsAsZip,
  type BundleEntry,
} from "../utils/download-bundle";
import { slugifyFilename } from "../utils/slugify-filename";
import { getPresetById } from "../presets";
import {
  CROPPING_IMAGE_FIT,
  IMAGE_FITS,
  IMAGE_POSITION_ANCHORS,
  LOSSLESS_OUTPUT_FORMAT,
  OUTPUT_FORMATS,
  OUTPUT_QUALITY_BOUNDS,
  isBackgroundColor,
} from "../constants/conversion-options";
import { validateImageDescriptionWrite } from "../lib/image-studio-write-targets";
import type {
  ImageFit,
  ImagePositionAnchor,
  OutputFormat,
  ProcessedVariant,
} from "../types";
import { Edit3, Layers, SlidersHorizontal, X, Zap } from "lucide-react";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";

interface ImageStudioShellProps {
  /** Optional default folder for Save-to-library. */
  defaultFolder?: string;
}

export function ImageStudioShell({ defaultFolder }: ImageStudioShellProps) {
  const studio = useImageStudio({ defaultFolder });

  // Track bundle-action selection — a set of variant filenames currently
  // ticked across all files. Filenames are unique because they include
  // the preset id + the file's filename base.
  const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(
    new Set(),
  );

  // ── Crop preview window state ─────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewPresetId, setPreviewPresetId] = useState<string | null>(null);

  // ── Initial-crop queue ────────────────────────────────────────────────
  // Every freshly-dropped/pasted file lands here first so the user can
  // optionally crop it before the rest of the studio sees it. When the
  // queue is empty the dialog stays closed.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // ── Rename-warning gate ──────────────────────────────────────────────
  // Each file's filenameBase becomes the per-source subfolder AND the
  // slug for every variant it produces. Generating 30 variants under an
  // ugly auto-derived name like "img-7234" is a chore to clean up later,
  // so we surface a banner that asks the user to either (a) rename the
  // root, (b) describe with AI to get a name, or (c) acknowledge and
  // generate anyway. Acknowledgement is per-Generate-click — adding a
  // file or AI-describing one resets it.
  const [renameAcknowledged, setRenameAcknowledged] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<null | "presets" | "export">(
    null,
  );
  // Each file card registers a `focusRename` action here on mount; the
  // shell calls it to enter rename mode and focus the input from afar
  // (e.g. when the user clicks "Rename now" in the auto-name banner).
  const renameActionsRef = useRef(new Map<string, () => void>());
  const registerRenameAction = useCallback(
    (fileId: string, action: (() => void) | null) => {
      if (action) renameActionsRef.current.set(fileId, action);
      else renameActionsRef.current.delete(fileId);
    },
    [],
  );

  // Reset the ack whenever the file set grows or any file is described.
  // (Removing a file or finishing a describe = enough has changed that
  // the banner deserves a fresh look.)
  useEffect(() => {
    setRenameAcknowledged(false);
  }, [studio.files.length, studio.describingFileIds]);

  const queueForCrop = useCallback((incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setPendingFiles((prev) => [...prev, ...images]);
  }, []);

  const handleCropQueueComplete = useCallback(
    (results: File[]) => {
      setPendingFiles([]);
      void studio.addFiles(results);
    },
    [studio],
  );

  const handleCropQueueCancel = useCallback(() => {
    setPendingFiles([]);
  }, []);

  // Auto-pick sensible defaults so the window has something to show.
  useEffect(() => {
    if (!previewFileId && studio.files[0]) {
      setPreviewFileId(studio.files[0].id);
    }
  }, [previewFileId, studio.files]);
  useEffect(() => {
    if (
      (!previewPresetId ||
        !studio.selectedPresetIds.includes(previewPresetId)) &&
      studio.selectedPresetIds[0]
    ) {
      setPreviewPresetId(studio.selectedPresetIds[0]);
    }
  }, [previewPresetId, studio.selectedPresetIds]);

  const openPreview = useCallback(
    (opts?: { fileId?: string; presetId?: string }) => {
      if (opts?.fileId) setPreviewFileId(opts.fileId);
      if (opts?.presetId) setPreviewPresetId(opts.presetId);
      setPreviewOpen(true);
    },
    [],
  );
  const toggleVariantSelect = useCallback((filename: string) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  // Pluck (fileId, variant) pairs for bundle actions.
  const allGeneratedVariants = useMemo(() => {
    const pairs: Array<{
      fileId: string;
      filenameBase: string;
      variant: ProcessedVariant;
    }> = [];
    for (const f of studio.files) {
      for (const v of Object.values(f.variants)) {
        pairs.push({ fileId: f.id, filenameBase: f.filenameBase, variant: v });
      }
    }
    return pairs;
  }, [studio.files]);

  const handleDownloadAll = useCallback(async () => {
    if (allGeneratedVariants.length === 0) return;
    const entries: BundleEntry[] = allGeneratedVariants.map(
      ({ filenameBase, variant }) => ({
        folder: studio.files.length > 1 ? filenameBase : undefined,
        filename: variant.filename,
        dataUrl: variant.dataUrl,
      }),
    );
    try {
      await downloadVariantsAsZip(
        entries,
        `image-studio-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      toast.success(`Downloaded ${entries.length} variants as a ZIP`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ZIP bundle failed";
      toast.error(msg);
    }
  }, [allGeneratedVariants, studio.files.length]);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedFilenames.size === 0) return;
    const entries: BundleEntry[] = allGeneratedVariants
      .filter(({ variant }) => selectedFilenames.has(variant.filename))
      .map(({ filenameBase, variant }) => ({
        folder: studio.files.length > 1 ? filenameBase : undefined,
        filename: variant.filename,
        dataUrl: variant.dataUrl,
      }));
    if (entries.length === 0) return;
    try {
      await downloadVariantsAsZip(
        entries,
        `image-studio-selected-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      toast.success(`Downloaded ${entries.length} selected variants`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ZIP bundle failed";
      toast.error(msg);
    }
  }, [allGeneratedVariants, selectedFilenames, studio.files.length]);

  const handleSaveAll = useCallback(
    async (folder: string, makePublic: boolean) => {
      await studio.saveAll(folder, {
        visibility: makePublic ? "public" : "personal",
      });
      if (!studio.error) {
        toast.success(
          makePublic
            ? "Saved to your library (public)"
            : "Saved to your library",
        );
      }
    },
    [studio],
  );

  // A file is "auto-named" when its current filenameBase matches the
  // slug of its original upload name AND the AI describe agent hasn't
  // overwritten it. These are the names the user almost always wants
  // to set BEFORE 30 variants get generated under them.
  const autoNamedFileIds = useMemo(() => {
    const ids: string[] = [];
    for (const f of studio.files) {
      const looksAuto =
        f.filenameBase === slugifyFilename(f.originalName) && !f.imageMetadata;
      if (looksAuto) ids.push(f.id);
    }
    return ids;
  }, [studio.files]);

  const focusFirstAutoNamed = useCallback(() => {
    const id = autoNamedFileIds[0];
    if (!id) return;
    const action = renameActionsRef.current.get(id);
    action?.();
  }, [autoNamedFileIds]);

  const handleGenerate = useCallback(async () => {
    // First click while auto-named files exist surfaces the banner —
    // don't generate yet. The user can rename, describe with AI, or
    // click Generate again to proceed.
    if (autoNamedFileIds.length > 0 && !renameAcknowledged) {
      setRenameAcknowledged(true);
      focusFirstAutoNamed();
      toast.warning(
        `${autoNamedFileIds.length} file${autoNamedFileIds.length === 1 ? "" : "s"} still uses an auto-generated name`,
        {
          description:
            "Rename them first or click Generate again to use the auto names.",
          duration: 4500,
        },
      );
      return;
    }
    await studio.generate();
    if (studio.files.some((f) => f.status !== "error")) {
      toast.success(
        `Generated ${studio.files.length * studio.selectedPresetIds.length} variants`,
      );
    }
  }, [studio, autoNamedFileIds, renameAcknowledged, focusFirstAutoNamed]);

  const handleDescribeAll = useCallback(async () => {
    if (studio.files.length === 0) return;
    const startedAt = Date.now();
    await studio.describeAll();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    toast.success(`Described ${studio.files.length} file(s) in ${elapsed}s`);
  }, [studio]);

  // ── Agent write targets (matrx-user/image-studio) ─────────────────────
  //
  // When an agent stages several targets in ONE turn, the writeback seam
  // resolves EVERY handler closure before the user confirms the first ask
  // dialog. So any live state a handler consults has to be read through a
  // ref — the render closure a handler was built in may already be a stale
  // snapshot by the time the user clicks Apply.
  const isProcessingRef = useRef(studio.isProcessing);
  const isSavingRef = useRef(studio.isSaving);
  const sourceFileCountRef = useRef(studio.files.length);
  // Same reason, for the crop anchor's gate below: an agent may stage the fit
  // in one call and the anchor in the next within a single turn, so the gate
  // has to resolve against the fit as it stands WHEN APPLIED, not the one
  // captured when the closure was built.
  const fitRef = useRef(studio.fit);
  // `image_description` needs the file LIST, not just its length: it resolves
  // which source image a write lands on by name. Assigned during render
  // rather than in the effect below because the identifying strings change
  // WITHOUT the length changing — a `filename_base` write renames the very
  // value the next call in the same turn matches on, and the effect's deps
  // would not fire for that.
  const filesRef = useRef(studio.files);
  filesRef.current = studio.files;

  useEffect(() => {
    isProcessingRef.current = studio.isProcessing;
    isSavingRef.current = studio.isSaving;
    sourceFileCountRef.current = studio.files.length;
    fitRef.current = studio.fit;
  }, [studio.files.length, studio.fit, studio.isProcessing, studio.isSaving]);

  // Both handlers validate and THROW on a bad shape; the writeback seam
  // (`applySurfaceWrite`) turns the throw into a safe error envelope the
  // agent reads and corrects from. Enum checks run against the same
  // `constants/conversion-options` module the Output-controls panel renders
  // its buttons from, and preset ids against the real catalog, so neither
  // can drift from what the user can actually pick.
  // Fresh closures per call (the `getWriteHandlers` contract).
  const getSurfaceWriteHandlers = useCallback(
    () => ({
      // The one target whose validation is NOT inline: it has to resolve
      // which source image the value lands on before it can check anything,
      // so the rule lives in a pure module (`lib/image-studio-write-targets`)
      // where the throw is synchronous and the resolution is readable on its
      // own. Lands through the same `updateImageMetadata` the Metadata
      // panel's inputs call.
      image_description: (value: unknown) => {
        const { fileId, patch } = validateImageDescriptionWrite(value, {
          files: filesRef.current,
          isProcessing: isProcessingRef.current,
          isSaving: isSavingRef.current,
        });
        studio.updateImageMetadata(fileId, patch);
      },
      selected_presets: (value: unknown) => {
        // Same guard, same reason, as `conversion_settings` below: the run in
        // flight captured the OLD preset list, and `total_variant_count` is
        // derived from this one — restaging it mid-run would leave the panel
        // promising a variant count nobody is producing.
        if (isProcessingRef.current)
          throw new Error(
            "A conversion is already running. selected_presets cannot be written while variants are being generated — wait for it to finish, then write the next selection.",
          );
        if (isSavingRef.current)
          throw new Error(
            "A save to the library is already running. selected_presets cannot be written until it finishes.",
          );
        if (sourceFileCountRef.current === 0)
          throw new Error(
            "No source images are loaded. selected_presets cannot be written into an empty studio — add images first, then choose the presets to create.",
          );
        if (!Array.isArray(value))
          throw new Error(
            'selected_presets expects an array of preset id strings, e.g. ["og-image", "favicon-32"]. It REPLACES the full selection — read selected_preset_ids first and include everything you want kept.',
          );

        // Validate the WHOLE list before touching state — a partial apply
        // would leave a selection nobody chose.
        const ids: string[] = [];
        const unknown: string[] = [];
        for (const entry of value) {
          if (typeof entry !== "string" || !entry.trim())
            throw new Error(
              "selected_presets entries must be non-empty preset id strings. Read available_presets for the ids that exist.",
            );
          const id = entry.trim();
          if (!getPresetById(id)) unknown.push(id);
          else ids.push(id);
        }
        if (unknown.length > 0)
          throw new Error(
            `selected_presets got ${unknown.length} id(s) that are not in the preset catalog: ${unknown.join(", ")}. Read available_presets for the valid ids — nothing was changed.`,
          );
        const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        if (duplicates.length > 0)
          throw new Error(
            `selected_presets got duplicate preset id(s): ${Array.from(new Set(duplicates)).join(", ")}. Each id may appear once — nothing was changed.`,
          );

        // The SAME full-replace path a "recommended bundle" click takes.
        studio.applyBundle(ids);
      },

      conversion_settings: (value: unknown) => {
        if (typeof value !== "object" || value === null || Array.isArray(value))
          throw new Error(
            "conversion_settings expects an object: { output_format?, output_quality?, background_color?, resize_fit?, resize_position? }.",
          );
        // Refuse rather than edit settings a run already committed to — the
        // in-flight conversion captured the OLD values, so a mid-run write
        // would leave the panel describing something nobody produced.
        if (isProcessingRef.current)
          throw new Error(
            "A conversion is already running. conversion_settings cannot be written while variants are being generated — wait for it to finish, then write the next settings.",
          );
        if (isSavingRef.current)
          throw new Error(
            "A save to the library is already running. conversion_settings cannot be written until it finishes.",
          );
        if (sourceFileCountRef.current === 0)
          throw new Error(
            "No source images are loaded. conversion_settings cannot be written into an empty studio — add images first, then stage the conversion settings.",
          );

        const patch = value as Record<string, unknown>;
        const allowedKeys = [
          "output_format",
          "output_quality",
          "background_color",
          "resize_fit",
          "resize_position",
        ];
        const unknownKeys = Object.keys(patch).filter(
          (k) => !allowedKeys.includes(k),
        );
        if (unknownKeys.length > 0)
          throw new Error(
            `conversion_settings got unsupported key(s): ${unknownKeys.join(", ")}. Allowed keys: ${allowedKeys.join(" | ")}. Presets are set with the selected_presets target, not here.`,
          );
        if (Object.keys(patch).length === 0)
          throw new Error(
            `conversion_settings needs at least one of: ${allowedKeys.join(" | ")}.`,
          );

        // Validate EVERY key before applying any of them — a partial apply
        // on a half-valid object would leave settings nobody chose.
        const apply: Array<() => void> = [];
        if ("output_format" in patch) {
          if (
            typeof patch.output_format !== "string" ||
            !OUTPUT_FORMATS.includes(patch.output_format as OutputFormat)
          )
            throw new Error(
              `conversion_settings.output_format expects one of: ${OUTPUT_FORMATS.join(" | ")}.`,
            );
          const next = patch.output_format as OutputFormat;
          apply.push(() => studio.setFormat(next));
        }
        if ("output_quality" in patch) {
          if (
            typeof patch.output_quality !== "number" ||
            !Number.isInteger(patch.output_quality) ||
            patch.output_quality < OUTPUT_QUALITY_BOUNDS.min ||
            patch.output_quality > OUTPUT_QUALITY_BOUNDS.max
          )
            throw new Error(
              `conversion_settings.output_quality expects a whole number from ${OUTPUT_QUALITY_BOUNDS.min} to ${OUTPUT_QUALITY_BOUNDS.max} (${LOSSLESS_OUTPUT_FORMAT} ignores it — it is always lossless).`,
            );
          const next = patch.output_quality;
          apply.push(() => studio.setQuality(next));
        }
        if ("background_color" in patch) {
          if (
            typeof patch.background_color !== "string" ||
            !isBackgroundColor(patch.background_color)
          )
            throw new Error(
              'conversion_settings.background_color expects a 6-digit hex string like "#ffffff".',
            );
          const next = patch.background_color;
          apply.push(() => studio.setBackgroundColor(next));
        }
        if ("resize_fit" in patch) {
          if (
            typeof patch.resize_fit !== "string" ||
            !IMAGE_FITS.includes(patch.resize_fit as ImageFit)
          )
            throw new Error(
              `conversion_settings.resize_fit expects one of: ${IMAGE_FITS.join(" | ")}.`,
            );
          const next = patch.resize_fit as ImageFit;
          apply.push(() => {
            fitRef.current = next;
            studio.setFit(next);
          });
        }
        if ("resize_position" in patch) {
          if (
            typeof patch.resize_position !== "string" ||
            !IMAGE_POSITION_ANCHORS.includes(
              patch.resize_position as ImagePositionAnchor,
            )
          )
            throw new Error(
              `conversion_settings.resize_position expects one of: ${IMAGE_POSITION_ANCHORS.join(" | ")}. A precise focal point is set by dragging the live preview and cannot be written.`,
            );
          // The anchor picker is rendered ONLY under the cropping fit —
          // `CropControls` hides the 3x3 grid entirely for the others, because
          // they never crop and so never consult an anchor. Staging one anyway
          // would put a value behind a control the user cannot see in the
          // confirm dialog and cannot correct afterwards, which is the one
          // thing a draft target must never do. Resolve the fit this call ends
          // up under — the one it sets, else the live one — and refuse the
          // incoherent pair outright rather than half-applying it.
          const resolvedFit =
            "resize_fit" in patch
              ? (patch.resize_fit as ImageFit)
              : fitRef.current;
          if (resolvedFit !== CROPPING_IMAGE_FIT)
            throw new Error(
              `conversion_settings.resize_position only applies under the "${CROPPING_IMAGE_FIT}" fit, but this call resolves to "${resolvedFit}"${
                "resize_fit" in patch ? "" : " (the fit currently set on the page)"
              }, which does not crop — its anchor picker is not on screen, so nothing was changed. Send { resize_fit: "${CROPPING_IMAGE_FIT}", resize_position } together to switch the fit and set the anchor in one call.`,
            );
          const next = patch.resize_position as ImagePositionAnchor;
          apply.push(() => studio.setPosition(next));
        }
        for (const run of apply) run();
      },
    }),
    [studio],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={IMAGE_STUDIO_SURFACE_NAME}
      getScope={studio.buildSurfaceScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
    {/* `@container/studio` so the three columns respond to the studio's OWN
        available width, not the viewport. The app sidebar (and the images
        sub-nav) eat width outside this container — keying the side panels off
        viewport `md`/`lg` used to let both claim their fixed widths and crush
        the center work-column to zero (content overflowed / "popped out"). */}
    <div className="@container/studio flex h-full min-h-0">
      {/* LEFT — Preset Catalog ─────────────────────────── */}
      <div className="hidden @3xl/studio:flex flex-col w-72 @5xl/studio:w-80 @7xl/studio:w-96 border-r border-border bg-card/30 min-h-0">
        <PresetCatalog
          selectedIds={studio.selectedPresetIds}
          onToggle={(id) => {
            studio.togglePreset(id);
            // Focus the preview on whichever preset the user just picked.
            if (!studio.selectedPresetIds.includes(id)) {
              setPreviewPresetId(id);
            }
          }}
          onApplyBundle={(ids) => {
            studio.applyBundle(ids);
            if (ids[0]) setPreviewPresetId(ids[0]);
          }}
          onDeselectAll={studio.deselectAllPresets}
        />
      </div>

      {/* CENTER — Work area ─────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto overscroll-contain">
        {/* Toggle bar for whichever side panel is currently collapsed.
            Shown below @5xl (Export hidden); the Presets button drops out
            at @3xl once the catalog is docked, so between @3xl–@5xl only
            Export remains reachable. */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 backdrop-blur @5xl/studio:hidden">
          <button
            type="button"
            onClick={() => setMobilePanel("presets")}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium @3xl/studio:hidden"
          >
            <Layers className="h-4 w-4" />
            Presets
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel("export")}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Export
          </button>
        </div>
        <div className="p-3 md:p-5 space-y-4">
          {studio.files.length === 0 ? (
            <StudioDropZone onFilesAdded={queueForCrop} />
          ) : (
            <>
              <StudioDropZone onFilesAdded={queueForCrop} compact />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {studio.files.length}
                  </span>{" "}
                  {studio.files.length === 1 ? "file" : "files"} ·
                  <span className="font-medium text-foreground ml-1">
                    {studio.selectedPresetIds.length}
                  </span>{" "}
                  selected presets
                </p>
                <button
                  type="button"
                  onClick={studio.clearAll}
                  className="text-xs text-muted-foreground hover:text-destructive underline"
                >
                  Remove all
                </button>
              </div>
              {/* Auto-name banner — surfaces when one or more files
                  still carry an auto-derived filenameBase. The slug
                  becomes the per-source subfolder AND every variant's
                  filename, so renaming up front saves a 30-file rename
                  later. */}
              {autoNamedFileIds.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5 p-3 flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Edit3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      {autoNamedFileIds.length === 1
                        ? "1 file still has an auto-generated name"
                        : `${autoNamedFileIds.length} files still have auto-generated names`}
                    </p>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-snug mt-0.5">
                      Rename now and your variants will inherit a clean,
                      shareable slug. Otherwise every preset will be saved under
                      the auto name.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={focusFirstAutoNamed}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-xs font-medium"
                      >
                        <Edit3 className="h-3 w-3" />
                        Rename now
                      </button>
                      <button
                        type="button"
                        onClick={handleDescribeAll}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 hover:bg-amber-500/10 text-amber-800 dark:text-amber-300 px-2.5 py-1 text-xs font-medium"
                      >
                        <Zap className="h-3 w-3" />
                        Use AI to name
                      </button>
                      {renameAcknowledged && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <Zap className="h-3 w-3" />
                          Click Generate again to use the auto names
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRenameAcknowledged(true)}
                    className="h-6 w-6 rounded-md hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0"
                    title="Dismiss for this Generate"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-3">
                {studio.files.map((f) => (
                  <StudioFileCard
                    key={f.id}
                    file={f}
                    selectedPresetIds={studio.selectedPresetIds}
                    selectedVariantFilenames={selectedFilenames}
                    isPreviewActive={previewFileId === f.id && previewOpen}
                    needsRename={autoNamedFileIds.includes(f.id)}
                    registerRenameAction={registerRenameAction}
                    onToggleVariantSelect={toggleVariantSelect}
                    onRemove={() => studio.removeFile(f.id)}
                    onRename={(base) => studio.setFilenameBase(f.id, base)}
                    onPreviewRequested={() => openPreview({ fileId: f.id })}
                    isDescribing={studio.describingFileIds.has(f.id)}
                    onDescribe={() => studio.describeFile(f.id)}
                    onMetadataPatch={(patch) =>
                      studio.updateImageMetadata(f.id, patch)
                    }
                    onMetadataRevert={() => studio.revertImageMetadata(f.id)}
                  />
                ))}
              </div>
            </>
          )}
          {studio.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {studio.error}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Export panel ───────────────────────────── */}
      <div className="hidden @5xl/studio:flex flex-col w-80 @7xl/studio:w-96 min-h-0">
        <ExportPanel
          format={studio.format}
          quality={studio.quality}
          backgroundColor={studio.backgroundColor}
          fit={studio.fit}
          position={studio.position}
          onFormatChange={studio.setFormat}
          onQualityChange={studio.setQuality}
          onBackgroundChange={studio.setBackgroundColor}
          onFitChange={studio.setFit}
          onPositionChange={studio.setPosition}
          isProcessing={studio.isProcessing}
          isSaving={studio.isSaving}
          canGenerate={
            studio.files.length > 0 && studio.selectedPresetIds.length > 0
          }
          canDownload={studio.generatedVariantCount > 0}
          canSave={studio.generatedVariantCount > 0}
          filesCount={studio.files.length}
          selectedPresetCount={studio.selectedPresetIds.length}
          totalVariantCount={studio.totalVariantCount}
          generatedVariantCount={studio.generatedVariantCount}
          totalOutputBytes={studio.totalOutputBytes}
          selectedVariantCount={selectedFilenames.size}
          onGenerate={handleGenerate}
          onDownloadAll={handleDownloadAll}
          onDownloadSelected={handleDownloadSelected}
          onSaveAll={handleSaveAll}
          lastSaveResult={studio.lastSaveResult}
          onOpenPreview={() => openPreview()}
          canOpenPreview={studio.files.length > 0}
          isPreviewOpen={previewOpen}
          onDescribeAll={handleDescribeAll}
          isDescribing={studio.isDescribing}
          describedFileCount={
            studio.files.filter((f) => f.imageMetadata).length
          }
        />
      </div>

      {/* Live crop preview — floating WindowPanel */}
      {previewOpen && (
        <CropPreviewWindow
          files={studio.files}
          selectedPresetIds={studio.selectedPresetIds}
          activeFileId={previewFileId}
          activePresetId={previewPresetId}
          onActiveFileChange={setPreviewFileId}
          onActivePresetChange={setPreviewPresetId}
          fit={studio.fit}
          position={studio.position}
          backgroundColor={studio.backgroundColor}
          onPositionChange={studio.setPosition}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Initial freeform crop, one image at a time */}
      <InitialCropWindow
        files={pendingFiles}
        onComplete={handleCropQueueComplete}
        onCancel={handleCropQueueCancel}
      />

      <BottomSheet
        open={mobilePanel === "presets"}
        onOpenChange={(open) => setMobilePanel(open ? "presets" : null)}
        title="Presets"
      >
        <BottomSheetHeader
          title="Presets"
          trailing={
            <button
              type="button"
              onClick={() => setMobilePanel(null)}
              className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
            >
              Done
            </button>
          }
        />
        <BottomSheetBody>
          <PresetCatalog
            selectedIds={studio.selectedPresetIds}
            onToggle={(id) => {
              studio.togglePreset(id);
              if (!studio.selectedPresetIds.includes(id)) {
                setPreviewPresetId(id);
              }
            }}
            onApplyBundle={(ids) => {
              studio.applyBundle(ids);
              if (ids[0]) setPreviewPresetId(ids[0]);
            }}
            onDeselectAll={studio.deselectAllPresets}
          />
        </BottomSheetBody>
      </BottomSheet>

      <BottomSheet
        open={mobilePanel === "export"}
        onOpenChange={(open) => setMobilePanel(open ? "export" : null)}
        title="Export"
      >
        <BottomSheetHeader
          title="Export"
          trailing={
            <button
              type="button"
              onClick={() => setMobilePanel(null)}
              className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
            >
              Done
            </button>
          }
        />
        <BottomSheetBody>
          <ExportPanel
            format={studio.format}
            quality={studio.quality}
            backgroundColor={studio.backgroundColor}
            fit={studio.fit}
            position={studio.position}
            onFormatChange={studio.setFormat}
            onQualityChange={studio.setQuality}
            onBackgroundChange={studio.setBackgroundColor}
            onFitChange={studio.setFit}
            onPositionChange={studio.setPosition}
            isProcessing={studio.isProcessing}
            isSaving={studio.isSaving}
            canGenerate={
              studio.files.length > 0 && studio.selectedPresetIds.length > 0
            }
            canDownload={studio.generatedVariantCount > 0}
            canSave={studio.generatedVariantCount > 0}
            filesCount={studio.files.length}
            selectedPresetCount={studio.selectedPresetIds.length}
            totalVariantCount={studio.totalVariantCount}
            generatedVariantCount={studio.generatedVariantCount}
            totalOutputBytes={studio.totalOutputBytes}
            selectedVariantCount={selectedFilenames.size}
            onGenerate={handleGenerate}
            onDownloadAll={handleDownloadAll}
            onDownloadSelected={handleDownloadSelected}
            onSaveAll={handleSaveAll}
            lastSaveResult={studio.lastSaveResult}
            onOpenPreview={() => openPreview()}
            canOpenPreview={studio.files.length > 0}
            isPreviewOpen={previewOpen}
            onDescribeAll={handleDescribeAll}
            isDescribing={studio.isDescribing}
            describedFileCount={
              studio.files.filter((f) => f.imageMetadata).length
            }
          />
        </BottomSheetBody>
      </BottomSheet>
    </div>
    </SurfaceRuntimeProvider>
  );
}
