"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import {
  ImageAssetUploader,
  type ImageUploaderResult,
} from "@/components/official/ImageAssetUploader";
import type { AssetPreset, Visibility } from "@/features/files";
import { useOpenImageUploaderWindow } from "@/features/window-panels/windows/image/useOpenImageUploaderWindow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink } from "lucide-react";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const PRESETS: Array<{
  preset: AssetPreset;
  label: string;
  description: string;
}> = [
  {
    preset: "raw",
    label: "Raw",
    description: "Original bytes only — no derived variants",
  },
  {
    preset: "podcast",
    label: "Podcast",
    description:
      "3000² cover + 1400² SD + OG + thumbnail + social baseline (Apple Podcasts spec)",
  },
  {
    preset: "social",
    label: "Social",
    description:
      "1200×630 OG + 1080² square + portrait + story + YT thumb + baseline",
  },
  {
    preset: "web",
    label: "Web",
    description:
      "1920×1080 hero + OG + card + 180² touch-icon + 512² PWA + thumbnail + baseline",
  },
  {
    preset: "email",
    label: "Email",
    description: "600×200 header + 200² square (no baseline)",
  },
  {
    preset: "logo",
    label: "Logo",
    description: "512² / 200² / 64² (org logos, app icons) + baseline",
  },
  {
    preset: "avatar",
    label: "Avatar",
    description: "400 / 256 / 128 / 64 / 32 (profile photos, user icons)",
  },
  {
    preset: "favicon",
    label: "Favicon",
    description: "192² android + 180² apple-touch + 32² + 16² (no baseline)",
  },
];

export default function ImageAssetUploaderDisplay({
  component,
}: ComponentDisplayProps) {
  const [preset, setPreset] = useState<AssetPreset>("social");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [enablePaste, setEnablePaste] = useState(true);
  const [allowUrlPaste, setAllowUrlPaste] = useState(true);
  const [enableViewerAction, setEnableViewerAction] = useState(true);
  const [compact, setCompact] = useState(false);
  const [hideVariantBadges, setHideVariantBadges] = useState(false);
  const [result, setResult] = useState<ImageUploaderResult | null>(null);
  const [tabResult, setTabResult] = useState<ImageUploaderResult | null>(null);
  const openWindow = useOpenImageUploaderWindow();

  const code = `import { ImageAssetUploader, type ImageUploaderResult } from '@/components/official/ImageAssetUploader';
import { useOpenImageUploaderWindow } from '@/features/window-panels/windows/image/useOpenImageUploaderWindow';

// ── Classic dropzone (default) ────────────────────────────────────────────
<ImageAssetUploader
  preset="social"
  currentUrl={form.image_url}
  enablePaste
  allowUrlPaste
  visibility="public"
  enableViewerAction
  onComplete={(result) => {
    if (!result) return clear();
    setForm({
      image_url: result.asset.primary_url,
      og_image_url: result.asset.variants.og_url?.url ?? null,
      thumbnail_url: result.asset.variants.thumbnail_url?.url ?? null,
    });
  }}
/>

// ── 4-source picker (Upload / Library / URL / Generate) ───────────────────
<ImageAssetUploader
  preset="podcast"
  showSourceTabs           // enables tab bar — all 4 sources
  defaultTab="upload"      // which tab opens first
  enableGenerate           // show Generate tab (placeholder until pipeline ships)
  currentUrl={form.image_url}
  onComplete={(result) => { /* same ImageUploaderResult shape */ }}
/>

// ── As a floating window (imperative) ────────────────────────────────────
const openUploader = useOpenImageUploaderWindow();
openUploader({
  preset: "logo",
  title: "Upload organization logo",
  currentUrl: form.logoUrl,
  onUploaded: (e) => setLogoUrl(e.result.primary_url),
  onCleared:  () => setLogoUrl(""),
});`;

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
      description="Two modes in one component. Classic dropzone (default) for direct upload. 4-source tab picker (showSourceTabs) adds Library (pick existing cloud file, variants auto-attached) and URL (fetch+upload, CORS fallback). Same onComplete shape across all modes."
    >
      <div className="w-full max-w-2xl space-y-6">
        <div className="rounded-lg border border-border bg-background/50 p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              checked={enablePaste}
              label="Capture paste"
              onChange={setEnablePaste}
            />
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
            <ToggleRow
              checked={compact}
              label="Compact"
              onChange={setCompact}
            />
            <ToggleRow
              checked={hideVariantBadges}
              label="Hide variant badges"
              onChange={setHideVariantBadges}
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
            preset={preset}
            onComplete={setResult}
            currentUrl={result?.primary_url ?? null}
            currentVariants={result}
            enablePaste={enablePaste}
            visibility={visibility}
            allowUrlPaste={allowUrlPaste}
            enableViewerAction={enableViewerAction}
            compact={compact}
            hideVariantBadges={hideVariantBadges}
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

        {/* ── 4-source tab picker demo ─────────────────────────────────── */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                4-source picker —{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  showSourceTabs
                </code>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload · Library · URL · Generate — same{" "}
                <code className="text-[11px]">ImageUploaderResult</code> shape
                from every source
              </p>
            </div>
            {tabResult && (
              <button
                type="button"
                onClick={() => setTabResult(null)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Reset
              </button>
            )}
          </div>

          <div className="border border-border rounded-xl p-4 bg-muted/10">
            <ImageAssetUploader
              preset={preset}
              showSourceTabs
              enableGenerate
              defaultTab="upload"
              currentUrl={tabResult?.primary_url ?? null}
              currentVariants={tabResult}
              visibility={visibility}
              enableViewerAction={enableViewerAction}
              label={`${preset.charAt(0).toUpperCase()}${preset.slice(1)} image`}
              onComplete={setTabResult}
            />
          </div>

          {tabResult && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
              <p className="text-xs font-medium">Result</p>
              <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {JSON.stringify(tabResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
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
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{label}</span>
    </label>
  );
}
