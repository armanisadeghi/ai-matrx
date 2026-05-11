"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import {
  ImageAssetUploader,
  type ImagePreset,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import { useOpenImageUploaderWindow } from "@/features/window-panels/windows/image/useOpenImageUploaderWindow";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import type { Visibility } from "@/features/files/types";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const PRESETS: Array<{
  preset: ImagePreset;
  label: string;
  description: string;
}> = [
  {
    preset: "social",
    label: "Social",
    description:
      "1400² cover + 1200×630 OG + 400² thumb (podcasts, posts, articles)",
  },
  {
    preset: "cover",
    label: "Cover",
    description: "1200×630 only (link previews, OG-only)",
  },
  {
    preset: "avatar",
    label: "Avatar",
    description: "400 / 128 / 48 (profile photos, user icons)",
  },
  {
    preset: "logo",
    label: "Logo",
    description: "512 / 200 / 64 (org logos, app icons)",
  },
  {
    preset: "favicon",
    label: "Favicon",
    description: "192 / 64 (browser tab icons, small marks)",
  },
  {
    preset: "square",
    label: "Square",
    description: "1024² single square (gallery items, thumbnails)",
  },
];

type UploaderMode = "asset" | "cloud";
type PasteCaptureMode = "auto" | "off" | "cloud" | "asset";

export default function ImageAssetUploaderDisplay({
  component,
}: ComponentDisplayProps) {
  const [preset, setPreset] = useState<ImagePreset>("social");
  const [mode, setMode] = useState<UploaderMode>("asset");
  const [pasteCaptureMode, setPasteCaptureMode] =
    useState<PasteCaptureMode>("asset");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [allowUrlPaste, setAllowUrlPaste] = useState(true);
  const [enableViewerAction, setEnableViewerAction] = useState(true);
  const [compact, setCompact] = useState(false);
  const [hideVariantBadges, setHideVariantBadges] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [result, setResult] = useState<ImageUploaderResult | null>(null);
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const openWindow = useOpenImageUploaderWindow();

  const code = `import { ImageAssetUploader, type ImageUploaderResult } from '@/components/official/ImageAssetUploader';
import { useOpenImageUploaderWindow } from '@/features/window-panels/windows/image/useOpenImageUploaderWindow';

// ── Inline (embedded in a form) ──────────────────────────────────────────
<ImageAssetUploader
  mode="asset"                      // "asset" | "cloud"
  preset="social"                    // "social" | "cover" | "avatar" | "logo" | "favicon" | "square"
  currentUrl={form.image_url}
  pasteCaptureMode="asset"           // paste clipboard images into the Sharp variant pipeline
  allowUrlPaste
  visibility="public"
  enableViewerAction                 // preview opens the shared image window panel
  onComplete={(result) => {
    if (!result) return clear();
    setForm({
      ...form,
      image_url: result.primary_url,
      og_image_url: result.og_image_url ?? null,
      thumbnail_url: result.thumbnail_url ?? null,
    });
  }}
/>

// ── As a floating window (imperative) ────────────────────────────────────
const openUploader = useOpenImageUploaderWindow();

openUploader({
  preset: "logo",
  title: "Upload organization logo",
  currentUrl: form.logoUrl,
  onUploaded: (e) => setLogoUrl(e.result.primary_url),
  onCleared:  () => setLogoUrl(""),
});

// Features
// - Server-side Sharp pipeline: all variants share one original, stay consistent
// - 6 presets covering every common image shape (social, logo, favicon, …)
// - mode="cloud" uses the Cloud Files upload pipeline for plain image uploads
// - Drag-drop, click, clipboard paste, OR paste a public URL
// - Cloud-files backed uploads with configurable visibility + folder
// - Optional preview action opens uploaded variants in the shared image panel`;

  const handleOpenWindow = () => {
    openWindow({
      preset,
      title: `Upload ${preset} image`,
      description:
        "This opens as a floating, draggable window — try it anywhere in the app.",
      currentUrl: result?.primary_url ?? null,
      onUploaded: (e) => setResult(e.result),
      onCleared: () => setResult(null),
    });
  };

  if (!component) return null;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Drag-and-drop image upload with server-side Sharp processing. One file in, every configured size out. Ships with six presets covering podcasts, OG images, avatars, logos, and favicons. The inline preview can open the uploaded variants in the shared image WindowPanel."
    >
      <div className="w-full max-w-2xl space-y-4">
        <div className="rounded-lg border border-border bg-background/50 p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ControlGroup label="Mode">
              <SegmentedOption
                active={mode === "asset"}
                onClick={() => {
                  setMode("asset");
                  setPasteCaptureMode("asset");
                  setUploadedIds([]);
                }}
              >
                Asset
              </SegmentedOption>
              <SegmentedOption
                active={mode === "cloud"}
                onClick={() => {
                  setMode("cloud");
                  setPasteCaptureMode("cloud");
                  setResult(null);
                }}
              >
                Cloud
              </SegmentedOption>
            </ControlGroup>

            <ControlGroup label="Paste">
              {(["auto", "off", "asset", "cloud"] as const).map((value) => (
                <SegmentedOption
                  key={value}
                  active={pasteCaptureMode === value}
                  onClick={() => setPasteCaptureMode(value)}
                >
                  {value}
                </SegmentedOption>
              ))}
            </ControlGroup>

            <ControlGroup label="Visibility">
              {(["public", "private"] as const).map((value) => (
                <SegmentedOption
                  key={value}
                  active={visibility === value}
                  onClick={() => setVisibility(value)}
                >
                  {value}
                </SegmentedOption>
              ))}
            </ControlGroup>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ToggleRow
              checked={allowUrlPaste}
              label="URL paste"
              onChange={setAllowUrlPaste}
            />
            <ToggleRow
              checked={enableViewerAction}
              label="Viewer action"
              onChange={setEnableViewerAction}
            />
            <ToggleRow checked={compact} label="Compact" onChange={setCompact} />
            <ToggleRow
              checked={hideVariantBadges}
              label="Hide variant badges"
              onChange={setHideVariantBadges}
            />
            <ToggleRow
              checked={multiple}
              label="Multiple files"
              onChange={setMultiple}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.preset}
              type="button"
              onClick={() => setPreset(p.preset)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                preset === p.preset
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {PRESETS.find((p) => p.preset === preset)?.description}
        </p>

        <div className="border border-border rounded-xl p-4 bg-muted/10">
          <ImageAssetUploader
            mode={mode}
            preset={preset}
            onComplete={setResult}
            onUploaded={setUploadedIds}
            currentUrl={result?.primary_url ?? null}
            currentVariants={result}
            pasteCaptureMode={pasteCaptureMode}
            visibility={visibility}
            allowUrlPaste={allowUrlPaste}
            enableViewerAction={enableViewerAction}
            compact={compact}
            hideVariantBadges={hideVariantBadges}
            multiple={multiple}
            label={`${preset.charAt(0).toUpperCase()}${preset.slice(1)} image`}
          />
        </div>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenWindow}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open as floating window
          </Button>
          {result && (
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Reset demo
            </button>
          )}
        </div>

        {result && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
            <p className="text-xs font-medium">Upload result</p>
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {uploadedIds.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
            <p className="text-xs font-medium">Cloud upload file ids</p>
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(uploadedIds, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </ComponentDisplayWrapper>
  );
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function SegmentedOption({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}
