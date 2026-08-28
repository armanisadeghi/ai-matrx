import type { Metadata } from "next";
import { Grid3x3 } from "lucide-react";
import { BatchStudio } from "./BatchStudio";

export const metadata: Metadata = {
  title: "The Batch Studio · Unified Management preview",
};

/**
 * PREVIEW ONLY — non-functional mockup of the platform-wide batch studio.
 * Mock data, no reads, no writes. The structure is the deliverable.
 *
 * Server Component shell: the heading, the framing and the dimensions render
 * instantly; only the studio itself is a client island.
 */
export default function BatchStudioPreviewPage() {
  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-4 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Grid3x3 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">
            The Batch Studio
          </h1>
          <span className="inline-flex h-5 items-center rounded border border-dashed border-amber-400/70 bg-amber-500/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-600/70 dark:text-amber-300">
            Preview · mock data · writes nothing
          </span>
        </div>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          The shortcut batch grid, elevated to the whole platform. Instead of
          one shortcut across many surfaces, this authors{" "}
          <span className="font-medium text-foreground">
            any set of jobs × any set of places
          </span>{" "}
          in one pass — input bindings and UI treatments riding the same
          three-level cascade: the template&apos;s value, one value set for all,
          or a per-cell answer. Nothing is ever locked. The platform resolves
          every cell it can by identity, offers a name re-match you confirm
          where it cannot, and goes loud only where nothing works.
        </p>
      </header>

      <BatchStudio />
    </div>
  );
}
