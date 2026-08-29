import type { Metadata } from "next";
import { Database, ShieldCheck } from "lucide-react";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  COMMERCE_KIND_SLUGS,
  loadCommerceExamples,
} from "./load-commerce-examples";

export const metadata: Metadata = {
  title: "Commerce Kinds — Live Examples",
  description:
    "Every active commerce kind rendered through its production route using its canonical live-registry example.",
};

export default async function CommerceKindsDemoPage() {
  const { examples, error } = await loadCommerceExamples();
  const complete = examples.length === COMMERCE_KIND_SLUGS.length;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Database className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                Live registry examples
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Commerce kind approval gallery
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              No fixture data: each card below is the canonical example stored
              with the active kind and rendered through KindInstanceRender, the
              production routing seam.
            </p>
          </div>
          <span
            className={
              complete
                ? "inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success"
                : "inline-flex rounded-full bg-warning/10 px-3 py-1 text-sm font-medium text-warning"
            }
          >
            {complete && <ShieldCheck className="h-4 w-4" />}
            {examples.length}/{COMMERCE_KIND_SLUGS.length} live
          </span>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </header>

      <div className="space-y-8" data-commerce-example-count={examples.length}>
        {examples.map((example, index) => (
          <article key={example.kind} id={example.kind} className="scroll-mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
              <div>
                <span className="text-xs font-semibold text-primary">
                  {index + 1}. {example.kind}
                </span>
                <h2 className="text-lg font-semibold text-foreground">
                  {example.label}
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                registry v{example.version} · example {example.validationStatus}
              </span>
            </div>
            <KindInstanceRender
              kind={example.kind}
              value={example.data}
              showRoutingNote
            />
          </article>
        ))}
      </div>
    </main>
  );
}
