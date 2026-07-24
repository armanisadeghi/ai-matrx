import type { Metadata } from "next";
import { Code2 } from "lucide-react";
import { StructuredDataValidatorTool } from "@/features/seo/public-tools/StructuredDataValidatorTool";

export const metadata: Metadata = {
  title: "Structured Data Validator — SEO Tools",
  description:
    "Parse JSON-LD and microdata on any page and validate against Google's rich-result requirements.",
};

export default function StructuredDataValidatorPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Code2 className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight text-foreground">
              Structured Data Validator
            </h1>
            <p className="text-[10px] leading-tight text-muted-foreground">
              SEO Tools · JSON-LD &amp; microdata against schema.org rich-result rules
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 pb-12 xl:px-8">
        <StructuredDataValidatorTool />
      </main>
    </div>
  );
}
