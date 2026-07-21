import type { Metadata } from "next";
import { MetadataAnalyzer } from "@/features/seo/serp/MetadataAnalyzer";
import { GoogleLogo } from "./_components/GoogleLogo";

export const metadata: Metadata = {
  title: "Meta Width Calculator — SEO Tools",
  description:
    "Calculate pixel widths and character counts for Google Search meta titles and descriptions with a live SERP preview. Updated for 2024.",
};

export default function MetaCalculatorPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <GoogleLogo size={26} />
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              Meta Width Calculator
            </h1>
            <p className="text-[10px] leading-tight text-muted-foreground">
              SEO Tools · Pixel &amp; character limits for Google Search
            </p>
          </div>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Updated 2026 · Google Sans · 13px descriptions
        </span>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 pb-12 xl:px-8">
        <MetadataAnalyzer />
      </main>
    </div>
  );
}
