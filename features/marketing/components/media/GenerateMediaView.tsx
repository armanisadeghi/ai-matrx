"use client";

/**
 * GenerateMediaView — order images "off the menu": pick a predetermined image
 * type (hero, share card, infographic…), describe the subject, and the
 * dimensions/style resolve from the site's media standards + the preset.
 * Generation runs the SAME headless two-step pipeline as the page image plan
 * (prompt generator → Matrx Image Ultra); results persist immediately as
 * `web.brand_asset` rows (source `generated`) — never a chat-only artifact.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useBrandAssets,
  useCreateBrandAsset,
} from "@/features/marketing/data/hooks";
import {
  generatePageImageTwoStep,
  type PageImageResult,
} from "@/features/marketing/lib/generate-page-image";
import {
  MEDIA_ORDER_PRESETS,
  buildSiteImageSpec,
  resolveOrderDimensions,
  type MediaOrderPreset,
} from "@/features/marketing/lib/media-order-presets";
import { MARKETING_SITE_MEDIA_SURFACE_NAME } from "@/features/marketing/lib/scopes/site-media-scope";
import type { SiteMediaStandards } from "@/features/marketing/data/media-library";
import type { BrandAssetKind } from "@/features/marketing/types";

/** Which library kind a generated image of each preset lands under. */
const PRESET_ASSET_KIND: Record<string, BrandAssetKind> = {
  hero: "hero_image",
  "share-card": "og_image",
};

export function GenerateMediaView({
  brandId,
  standards,
  initialBrief,
  onBriefConsumed,
}: {
  brandId: string;
  standards: SiteMediaStandards;
  /** Prefilled subject (from "Order replacement" / "Use as brief"). */
  initialBrief: string | null;
  onBriefConsumed: () => void;
}) {
  const dispatch = useAppDispatch();
  const { site } = useMarketingSite();
  const createAsset = useCreateBrandAsset();
  const assetsQuery = useBrandAssets(brandId);

  const [presetId, setPresetId] = useState<string>(
    MEDIA_ORDER_PRESETS[0]?.id ?? "hero",
  );
  const [subject, setSubject] = useState("");
  const [styleOverride, setStyleOverride] = useState("");
  const [widthOverride, setWidthOverride] = useState("");
  const [heightOverride, setHeightOverride] = useState("");
  const [generating, setGenerating] = useState(false);

  // Consume an incoming brief exactly once (effect, not render side effect).
  useEffect(() => {
    if (initialBrief) {
      setSubject(initialBrief);
      onBriefConsumed();
    }
  }, [initialBrief, onBriefConsumed]);

  const preset: MediaOrderPreset =
    MEDIA_ORDER_PRESETS.find((item) => item.id === presetId) ??
    MEDIA_ORDER_PRESETS[0]!;

  const resolved = useMemo(
    () => resolveOrderDimensions(preset, standards),
    [preset, standards],
  );
  const width = widthOverride ? Number(widthOverride) : resolved.width;
  const height = heightOverride ? Number(heightOverride) : resolved.height;

  const generatedAssets = useMemo(
    () =>
      (assetsQuery.data ?? [])
        .filter((asset) => asset.source === "generated" && asset.file_id)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 12),
    [assetsQuery.data],
  );

  /**
   * Hard ceiling on the whole order. The two-step pipeline's internal waits
   * are bounded, but a hung stream in the execution system can leave its
   * promise pending forever (observed 2026-08-08: server completed both runs
   * and returned the image while the client spinner never resolved). The UI
   * must never spin forever — after this deadline we fail LOUDLY and tell the
   * user the image may still exist server-side.
   */
  const ORDER_DEADLINE_MS = 5 * 60_000;

  const order = async () => {
    if (!subject.trim()) {
      toast.error("Describe the subject before ordering the image.");
      return;
    }
    setGenerating(true);
    try {
      const spec = buildSiteImageSpec({
        siteName: site.name,
        siteUrl: site.root_url,
        preset,
        subject: subject.trim(),
        dimensions: {
          ...resolved,
          width: Number.isFinite(width) && width > 0 ? width : resolved.width,
          height:
            Number.isFinite(height) && height > 0 ? height : resolved.height,
        },
        standardsNotes: standards.notes || undefined,
      });
      const result: PageImageResult = await Promise.race([
        dispatch(
          generatePageImageTwoStep({
            spec,
            style: styleOverride.trim() || preset.style,
            surfaceKey: MARKETING_SITE_MEDIA_SURFACE_NAME,
          }),
        ),
        new Promise<PageImageResult>((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: false,
                step: "image",
                message:
                  "The run did not report back within 5 minutes. The image may still have been generated — check the Library shortly or retry.",
              }),
            ORDER_DEADLINE_MS,
          ),
        ),
      ]);
      if (!result.ok) {
        toast.error(
          result.step === "prompt"
            ? "Generation failed at the prompt step"
            : "Generation failed at the image step",
          { description: result.message },
        );
        return;
      }
      await createAsset.mutateAsync({
        organizationId: site.organization_id,
        brandId,
        kind: PRESET_ASSET_KIND[preset.id] ?? "image",
        sourceUrl: null,
        fileId: result.fileId,
        title: subject.trim().slice(0, 120),
        notes: `AI-generated ${preset.label.toLowerCase()} (${width}×${height}) for ${site.name}.`,
        isPrimary: false,
        source: "generated",
      });
      toast.success("Image generated and saved to the brand library");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
          1 · Pick the type
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {MEDIA_ORDER_PRESETS.map((item) => {
            const dims = resolveOrderDimensions(item, standards);
            const active = item.id === presetId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPresetId(item.id)}
                className={cn(
                  "rounded-lg border p-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-foreground">
                    {item.label}
                  </span>
                  {dims.source === "standard" ? (
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[8px] text-emerald-600 dark:text-emerald-400"
                      title={`Dimensions from your “${dims.slotName}” standard`}
                    >
                      std
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground">
                  {item.description}
                </p>
                <p className="mt-1 text-[9px] tabular-nums text-muted-foreground/70">
                  {dims.width}×{dims.height}
                  {dims.format ? ` · ${dims.format}` : ""}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
          2 · Describe the subject
        </h3>
        <Textarea
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          minHeight={64}
          maxHeight={160}
          placeholder={`What should this ${preset.label.toLowerCase()} show? Subject, mood, key elements…`}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Style (optional override)</Label>
            <Input
              value={styleOverride}
              onChange={(event) => setStyleOverride(event.target.value)}
              placeholder={preset.style}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Width</Label>
            <Input
              value={widthOverride}
              onChange={(event) =>
                setWidthOverride(event.target.value.replace(/\D/g, ""))
              }
              placeholder={String(resolved.width)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Height</Label>
            <Input
              value={heightOverride}
              onChange={(event) =>
                setHeightOverride(event.target.value.replace(/\D/g, ""))
              }
              placeholder={String(resolved.height)}
              inputMode="numeric"
            />
          </div>
        </div>
        {resolved.source === "standard" ? (
          <p className="px-1 text-[10px] text-muted-foreground/70">
            Dimensions come from this site&apos;s “{resolved.slotName}” media
            standard — override only if this order is special.
          </p>
        ) : (
          <p className="px-1 text-[10px] text-muted-foreground/70">
            No matching media standard — using the preset default. Define
            standards in the Standards view and every order inherits them.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8"
            disabled={generating || createAsset.isPending}
            onClick={() => void order()}
          >
            {generating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {generating ? "Generating…" : "Order this image"}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Prompt generator → Matrx Image Ultra · lands in the brand library
          </span>
        </div>
      </section>

      {generatedAssets.length > 0 ? (
        <section className="space-y-2 border-t border-border/60 pt-3">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
            Recently generated
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {generatedAssets.map((asset) => (
              <CaptureThumb
                key={asset.id}
                fileId={asset.file_id!}
                alt={asset.title ?? "Generated image"}
                aspectClassName="aspect-[4/3]"
                footer={
                  <p
                    className="truncate px-1.5 py-1 text-[10px] text-muted-foreground"
                    title={asset.title ?? undefined}
                  >
                    {asset.title ?? "Generated image"}
                  </p>
                }
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
