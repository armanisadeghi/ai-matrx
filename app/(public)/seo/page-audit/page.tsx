import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageAuditTool } from "@/features/seo/public-tools/PageAuditTool";

export const metadata: Metadata = {
  title: "Page SEO Audit — SEO Tools",
  description:
    "Scrape any URL and get an instant on-page audit — title, description, headings, canonical, robots directives, and more.",
};

export default function PageAuditPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              Page SEO Audit
            </h1>
            <p className="text-[10px] leading-tight text-muted-foreground">
              SEO Tools · Instant on-page audit with a 0-100 score
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 pb-12 xl:px-8">
        <PageAuditTool />
      </main>
    </div>
  );
}
