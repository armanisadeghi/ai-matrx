import type { Metadata } from "next";
import { Share2 } from "lucide-react";
import { SocialCardAnalyzer } from "@/features/seo/social/SocialCardAnalyzer";

export const metadata: Metadata = {
  title: "Social Card Preview — SEO Tools",
  description:
    "Preview exactly how your link renders when shared on X, Facebook, and LinkedIn — with instant checks on your Open Graph and Twitter card tags.",
};

export default function SocialCardPreviewPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Share2 className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              Social Card Preview
            </h1>
            <p className="text-[10px] leading-tight text-muted-foreground">
              SEO Tools · Open Graph &amp; Twitter card previews for X, Facebook,
              LinkedIn
            </p>
          </div>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Updated 2026 · og: + twitter: tags · 1200×630 images
        </span>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 pb-12 xl:px-8">
        <SocialCardAnalyzer />
      </main>
    </div>
  );
}
