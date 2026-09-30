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
        {/* Shortcut batch grid generalised: any jobs × any places over the three-level cascade. */}
      </header>

      <BatchStudio />
    </div>
  );
}
