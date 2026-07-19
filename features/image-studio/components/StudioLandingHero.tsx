import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Braces,
  CloudUpload,
  Download,
  Gauge,
  Layers,
  Palette,
  Upload,
  Zap
} from "lucide-react";
import { PresetCategoryLegend } from "./PresetCatalog";
import { ALL_PRESETS, RECOMMENDED_BUNDLES } from "../presets";

/**
 * Landing content — pure Server Component. All HTML prerendered, zero JS
 * ships from this file. No marketing hero: the tool/reference content
 * starts at the top; navigation lives in the sidebar + shell header.
 */
export function StudioLandingHero() {
  const presetCount = ALL_PRESETS.length;
  const bundleCount = RECOMMENDED_BUNDLES.length;

  return (
    <div className="flex flex-col">
      {/* Feature grid */}
      <section className="container mx-auto px-5 sm:px-6 md:px-10 py-4 md:py-8 max-w-[1400px]">
        <h2 className="text-base md:text-2xl font-semibold tracking-tight mb-2 md:mb-6">
          Built for real workflows
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
          <FeatureCard
            icon={<Upload className="h-5 w-5" />}
            title="Batch upload"
            body="Drag &amp; drop many images at once. Paste from clipboard. Every file gets every selected preset — in parallel, on the server."
            href="/images/convert"
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Smart bundles"
            body={`One click applies a curated set: "Share Everywhere", "Complete Favicon Set", "Full Avatar Set", and ${bundleCount - 3} more.`}
            href="/images/convert"
          />
          <FeatureCard
            icon={<Gauge className="h-5 w-5" />}
            title="Format + quality control"
            body="Global WebP / AVIF / JPEG / PNG, quality slider from 30–100%, transparent-fill colour for JPEG/AVIF. PNG stays lossless."
          />
          <FeatureCard
            icon={<Palette className="h-5 w-5" />}
            title="Platform-perfect sizing"
            body="Cover Sharp-based resize with centre-anchored crop for every preset. EXIF orientation respected. Progressive JPEG, mozjpeg encoder."
          />
          <FeatureCard
            icon={<Download className="h-5 w-5" />}
            title="Download any way you want"
            body="One file at a time, a ZIP of the selected tiles, or the full ZIP bundle organised by source filename."
          />
          <FeatureCard
            icon={<CloudUpload className="h-5 w-5" />}
            title="Save to your library"
            body="Push every variant to your Supabase storage in one click. Public URLs ready to paste into your app, copied straight from each tile."
            href="/images/library"
          />
          <FeatureCard
            icon={<Braces className="h-5 w-5" />}
            title="Paste base64 → cloud URL"
            body="Got a base64 blob from an API or notebook? Paste it in, preview the decoded image, and turn it into a hosted asset with a permanent share URL."
            href="/images/from-base64"
          />
        </div>
      </section>

      {/* Preset legend */}
      <section className="container mx-auto px-5 sm:px-6 md:px-10 pb-6 md:pb-12 max-w-[1400px]">
        <div className="rounded-lg md:rounded-2xl border border-border bg-card p-4 md:p-6">
          <div className="flex items-start justify-between gap-6 flex-wrap mb-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                The preset catalog
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                All {presetCount}+ sizes that ship in the studio, grouped by
                purpose. Click{" "}
                <Link
                  href="/images/presets"
                  className="underline text-primary"
                >
                  Browse all presets
                </Link>{" "}
                for the full reference with platform specs and usage notes.
              </p>
            </div>
            <Link
              href="/images/convert"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Start converting <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <PresetCategoryLegend />
        </div>
      </section>

      {/* Workflow walkthrough */}
      <section className="container mx-auto px-5 sm:px-6 md:px-10 pb-8 md:pb-16 max-w-[1400px]">
        <h2 className="text-lg md:text-2xl font-semibold tracking-tight mb-3 md:mb-6">
          The 30-second workflow
        </h2>
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <WorkflowStep
            number={1}
            title="Drop your image"
            body="Drag, click, or paste. Multi-file supported."
            icon={<Upload className="h-4 w-4" />}
          />
          <WorkflowStep
            number={2}
            title="Pick presets"
            body="Tick a bundle or hand-pick from the catalog."
            icon={<Layers className="h-4 w-4" />}
          />
          <WorkflowStep
            number={3}
            title="Generate"
            body="Server-side Sharp resizes, crops, compresses."
            icon={<Zap className="h-4 w-4" />}
          />
          <WorkflowStep
            number={4}
            title="Download or save"
            body="Individual files, ZIP bundle, or save to library."
            icon={<Download className="h-4 w-4" />}
          />
        </ol>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="h-10 w-10 rounded-lg md:rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-0 md:mb-3 shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold tracking-tight flex items-center gap-1.5 text-sm md:text-base">
          {title}
          {href && (
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary shrink-0" />
          )}
        </h3>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 leading-relaxed line-clamp-2 md:line-clamp-none">
          {body}
        </p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group rounded-lg md:rounded-2xl border border-border bg-card p-3 md:p-5 hover:border-primary/40 transition-colors flex items-center gap-3 md:block"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-lg md:rounded-2xl border border-border bg-card p-3 md:p-5 hover:border-primary/40 transition-colors flex items-center gap-3 md:block">
      {inner}
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  body,
  icon,
}: {
  number: number;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <li className="rounded-lg md:rounded-xl border border-border bg-card p-3 md:p-4 flex flex-row md:flex-col items-center md:items-start gap-3 md:gap-2 relative">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center font-semibold text-sm tabular-nums">
          {number}
        </div>
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {body}
        </p>
      </div>
    </li>
  );
}
