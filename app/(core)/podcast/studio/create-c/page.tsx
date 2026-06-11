import Link from "next/link";
import { ArrowLeft, Podcast } from "lucide-react";
import { CreateComposer } from "./_components/CreateComposer";


// Bake-off variation C — redesigned create surface.
// Reachable at /podcast/studio/create-c.
export default function CreateEpisodeCPage() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
      <div className="mx-auto max-w-4xl px-4 py-6 pr-14 sm:py-8">
        {/* One-row header: back link + title on the same line. */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/podcast/studio"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            aria-label="Back to studio"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
            <Podcast className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            New episode
          </h1>
        </div>

        <CreateComposer />
      </div>
    </div>
  );
}
