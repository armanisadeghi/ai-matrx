"use client";

// Preview body for a single real-favicon test route. The real judging surface
// is the browser tab itself (look up top); this page just shows a big preview,
// a size ladder, and links so you can tab between every variant.
import Link from "next/link";
import { FAVICON_VARIANTS, type FaviconVariantId } from "@/utils/favicon-variants";
import { svgToDataURI } from "@/utils/favicon-utils";
import { LAB_LETTER, LAB_COLOR } from "./faviconMeta";

const SIZES = [16, 20, 24, 32, 48];
const cfg = { letter: LAB_LETTER, color: LAB_COLOR };

export default function VariantPreview({ id }: { id: FaviconVariantId }) {
  const variant = FAVICON_VARIANTS.find((v) => v.id === id)!;
  const uri = svgToDataURI(variant.generate(cfg));

  return (
    <div className="min-h-dvh bg-textured text-foreground overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/demos/favicon-lab"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Favicon Lab
        </Link>

        <div className="mt-4 flex items-center gap-4">
          <img src={uri} width={72} height={72} alt={variant.label} />
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {variant.label}
              <span
                className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                  variant.distorts
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {variant.distorts ? "distorts" : "true shape"}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              {variant.blurb}
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Look at the browser tab above — that&apos;s the real favicon. Size
          ladder for reference:
        </p>
        <div className="mt-3 flex items-end gap-5 rounded-lg border border-border bg-card p-4">
          {SIZES.map((s) => (
            <div key={s} className="flex flex-col items-center gap-1.5">
              <img src={uri} width={s} height={s} alt={`${s}px`} />
              <span className="text-[10px] text-muted-foreground">{s}px</span>
            </div>
          ))}
        </div>

        <h2 className="mt-8 mb-2 text-sm font-medium">
          Open the others (each sets its own real favicon)
        </h2>
        <div className="flex flex-wrap gap-2">
          {FAVICON_VARIANTS.filter((v) => v.slug).map((v) => (
            <Link
              key={v.id}
              href={`/demos/favicon-lab/${v.slug}`}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                v.id === id
                  ? "border-primary bg-accent text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
