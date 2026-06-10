"use client";

// create-b — redesigned podcast create page.
//
// Self-contained demo of the new compose experience. The Generate button flows
// into the matching demo run page (/podcast/studio/run-b) instead of hitting the
// backend, so the two redesigns can be reviewed end-to-end.

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Podcast } from "lucide-react";
import { ComposerForm } from "./_components/ComposerForm";

export default function CreateEpisodePageB() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleGenerate = () => {
    startTransition(() => router.push("/podcast/studio/run-b"));
  };

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <div className="mx-auto max-w-3xl px-4 py-6 pr-14 sm:py-10">
        {/* Back link + title on ONE row. */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/podcast/studio"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-glass-edge bg-glass text-muted-foreground shadow-glass backdrop-blur-glass transition-colors hover:bg-glass-hover hover:text-foreground"
            aria-label="Back to studio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
            <Podcast className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Create an episode
            </h1>
            <p className="text-xs text-muted-foreground">
              From any idea to a produced two-host episode.
            </p>
          </div>
        </div>

        <ComposerForm onGenerate={handleGenerate} />
      </div>
    </div>
  );
}
