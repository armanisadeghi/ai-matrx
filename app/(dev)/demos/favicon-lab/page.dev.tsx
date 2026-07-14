"use client";

// Favicon bakeoff — compare candidate two-letter badge generators at real tab
// sizes. Experimental; generators live in @/utils/favicon-variants. Once a
// winner is picked, fold it into generateSVGFavicon and delete this route.

import { useState } from "react";
import Link from "next/link";
import { FAVICON_VARIANTS, type FaviconVariant } from "@/utils/favicon-variants";
import { svgToDataURI } from "@/utils/favicon-utils";
import type { FaviconConfig } from "@/constants/favicon-route-data";

// The letter pairs Arman actually ships, each with a distinct route-ish color.
const PAIRS: FaviconConfig[] = [
  { letter: "WR", color: "#dc2626" }, // War Room
  { letter: "RI", color: "#0891b2" },
  { letter: "AB", color: "#7c3aed" },
  { letter: "AR", color: "#db2777" },
  { letter: "CH", color: "#2563eb" },
  { letter: "RQ", color: "#ca8a04" },
  { letter: "LG", color: "#1e40af" },
  { letter: "ED", color: "#059669" },
];

// Real browser-tab favicon render sizes.
const TAB_SIZES = [16, 20, 24, 32];

function Badge({
  variant,
  config,
  size,
}: {
  variant: FaviconVariant;
  config: FaviconConfig;
  size: number;
}) {
  const uri = svgToDataURI(variant.generate(config));
  return (
    <img
      src={uri}
      width={size}
      height={size}
      alt={`${config.letter} ${variant.label} ${size}px`}
      style={{ width: size, height: size, imageRendering: "auto" }}
    />
  );
}

// A fake browser-tab strip so the badge is judged in context, not floating.
function TabStrip({
  variant,
  config,
  dark,
}: {
  variant: FaviconVariant;
  config: FaviconConfig;
  dark: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-t-md px-2.5 py-1.5 border-b-2 min-w-[150px] ${
        dark
          ? "bg-zinc-800 border-zinc-500 text-zinc-100"
          : "bg-zinc-100 border-zinc-300 text-zinc-800"
      }`}
    >
      <Badge variant={variant} config={config} size={16} />
      <span className="text-xs truncate">{config.letter} Route</span>
    </div>
  );
}

export default function FaviconLabPage() {
  const [selected, setSelected] = useState<FaviconConfig>(PAIRS[0]);

  return (
    <div className="min-h-dvh bg-textured text-foreground overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">Favicon Bakeoff</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Candidate generators for the two-letter route badge, judged as real
            tab favicons. Every one keeps a guaranteed{" "}
            <span className="font-medium text-foreground">1.5px tile ring</span>{" "}
            around the whole edge so the white letters never dissolve into a
            near-white page — either by stretching to fill (flush all sides) or
            by sizing big and clipping (true shape, tips cut). War Room&apos;s
            live tab uses{" "}
            <span className="font-medium text-foreground">Stretch · 1.5px inset</span>.
          </p>
          <div className="mt-4 rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-medium mb-2">
              See them as REAL tab favicons — open each in a new tab and compare
              the tab bar:
            </p>
            <div className="flex flex-wrap gap-2">
              {FAVICON_VARIANTS.filter((v) => v.slug).map((v) => (
                <Link
                  key={v.id}
                  href={`/demos/favicon-lab/${v.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <img
                    src={svgToDataURI(v.generate({ letter: "WR", color: "#dc2626" }))}
                    width={16}
                    height={16}
                    alt=""
                  />
                  {v.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        {/* Focus picker — pick a pair to inspect closely across every variant */}
        <section className="mb-10">
          <div className="flex flex-wrap gap-2 mb-4">
            {PAIRS.map((p) => (
              <button
                key={p.letter}
                onClick={() => setSelected(p)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                  selected.letter === p.letter
                    ? "border-primary bg-accent text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                {p.letter}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FAVICON_VARIANTS.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{v.label}</span>
                  <span
                    className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                      v.distorts
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {v.distorts ? "distorts" : "true shape"}
                  </span>
                </div>

                {/* Big preview */}
                <div className="flex items-center gap-4">
                  <Badge variant={v} config={selected} size={96} />
                  {/* Size ladder — the real judging surface */}
                  <div className="flex items-end gap-3">
                    {TAB_SIZES.map((s) => (
                      <div key={s} className="flex flex-col items-center gap-1">
                        <Badge variant={v} config={selected} size={s} />
                        <span className="text-[10px] text-muted-foreground">
                          {s}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* In-context tab chips */}
                <div className="flex gap-2">
                  <TabStrip variant={v} config={selected} dark={false} />
                  <TabStrip variant={v} config={selected} dark />
                </div>

                <p className="text-xs text-muted-foreground">{v.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Full matrix — every variant across every pair at 32px */}
        <section>
          <h2 className="text-lg font-medium mb-3">
            All pairs · every variant · 32px
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left font-medium px-3 py-2 sticky left-0 bg-muted/50">
                    Variant
                  </th>
                  {PAIRS.map((p) => (
                    <th key={p.letter} className="px-3 py-2 font-medium">
                      {p.letter}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FAVICON_VARIANTS.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card">
                      {v.label}
                    </td>
                    {PAIRS.map((p) => (
                      <td key={p.letter} className="px-3 py-2 text-center">
                        <div className="inline-flex items-center justify-center">
                          <Badge variant={v} config={p} size={32} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
