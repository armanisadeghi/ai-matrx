// The 404 for /intelligence/<slug> when no feature by that name has AI jobs —
// a real not-found, never an empty page that looks like a feature.

import Link from "next/link";
import { BrainCircuit } from "lucide-react";

export default function FeatureIntelligenceNotFound() {
  return (
    <div className="flex h-full items-center justify-center px-4 pt-[var(--shell-header-h)]">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <BrainCircuit className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold text-foreground">No feature by that name</h1>
        <Link
          href="/intelligence"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          See every feature
        </Link>
      </div>
    </div>
  );
}
