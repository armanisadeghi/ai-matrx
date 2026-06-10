import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Podcast } from "lucide-react";
import { StudioComposer } from "./_components/StudioComposer";

export const metadata: Metadata = {
  title: "New episode — Podcast Studio",
  description:
    "Compose a fully produced podcast episode from any source, then watch it being made live.",
};

// Variation F · create surface (design bake-off). Two-pane composer with a live
// episode brief. Generate routes to the self-contained run-f demo.
export default function CreateFPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 pr-14 sm:py-7">
        <div className="mb-6">
          <Link
            href="/podcast/studio"
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Studio
          </Link>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
              <Podcast className="h-5 w-5" />
            </span>
            New episode
          </h1>
        </div>

        <StudioComposer />
      </div>
    </div>
  );
}
