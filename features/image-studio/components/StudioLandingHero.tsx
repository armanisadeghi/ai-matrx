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
  Atom,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { PresetCategoryLegend } from "./PresetCatalog";
import {
  ALL_PRESETS,
  PRESET_CATEGORIES,
  RECOMMENDED_BUNDLES,
} from "../presets";

/**
 * Landing hero — pure Server Component. All HTML prerendered, zero JS ships
 * from this file.
 */
export function StudioLandingHero() {
  const presetCount = ALL_PRESETS.length;
  const categoryCount = PRESET_CATEGORIES.length;
  const bundleCount = RECOMMENDED_BUNDLES.length;

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
        />
        <div className="relative container mx-auto px-5 sm:px-6 md:px-10 py-4 md:py-16 max-w-[1400px]">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2 md:mb-4">
            <Atom className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider">Image Studio</span>
          </div>
          <h1 className="max-w-3xl text-[1.65rem] font-bold leading-[1.08] tracking-tight md:text-5xl md:leading-tight">
            Drop one image in.
            <br />
            <span className="text-primary">
              Get {presetCount}+ platform-perfect sizes out.
            </span>
          </h1>
          <p className="hidden sm:block text-base md:text-lg text-muted-foreground mt-4 max-w-2xl leading-relaxed">
            Every social network, every favicon, every avatar size, every
            e-commerce platform, every email client — generated, compressed, and
            renamed for you. One upload, every size you&rsquo;ll ever need.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 md:mt-6 md:flex md:flex-wrap md:gap-3">
            <Link
              href="/images/convert"
              className="col-span-2 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-primary/90 md:col-auto md:min-h-[40px] md:justify-start md:px-5"
            >
              <Upload className="h-4 w-4" />
              Start converting
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/images/presets"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 md:justify-start md:px-5"
            >
              <Layers className="h-4 w-4" />
              <span className="truncate md:hidden">All {presetCount} presets</span>
              <span className="hidden md:inline">
                Browse all {presetCount} presets
              </span>
            </Link>
            <Link
              href="/images/from-base64"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 md:justify-start md:px-5"
            >
              <Braces className="h-4 w-4" />
              Paste base64
            </Link>
            <Link
              href="/images/library"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 md:justify-start md:px-5"
            >
              <CloudUpload className="h-4 w-4" />
              My library
            </Link>
          </div>

          {/* Stat row */}
          <div className="mt-4 grid max-w-3xl grid-cols-2 gap-2 md:mt-10 md:grid-cols-4 md:gap-4">
            <Stat value={`${presetCount}+`} label="Presets" />
            <Stat value={categoryCount} label="Categories" />
            <Stat value={bundleCount} label="One-click bundles" />
            <Stat value="4" label="Output formats" />
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="container mx-auto px-5 sm:px-6 md:px-10 py-4 md:py-14 max-w-[1400px]">
        <h2 className="text-base md:text-2xl font-semibold tracking-tight mb-2 md:mb-6">
          Built for real workflows
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
          <FeatureCard
            icon={<Upload className="h-5 w-5" />}
            title="Batch upload"
            body="Drag &amp; drop many images at once. Paste from clipboard. Every file gets every selected preset — in parallel, on the server."
          />
          <FeatureCard
            icon={<Wand2 className="h-5 w-5" />}
            title="Smart bundles"
            body={`One click applies a curated set: "Share Everywhere", "Complete Favicon Set", "Full Avatar Set", and ${bundleCount - 3} more.`}
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
                Every size that ships in the studio, grouped by purpose. Click{" "}
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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg md:rounded-xl border border-border bg-card/60 backdrop-blur px-3 py-2 md:px-4 md:py-3">
      <div className="text-xl font-bold tracking-tight md:text-3xl">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground md:text-xs md:tracking-wider">
        {label}
      </div>
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
