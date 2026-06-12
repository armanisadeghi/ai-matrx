// app/(core)/podcast/studio/create-d/_components/StudioHeader.tsx
//
// Slim server-rendered header for the composer. No narration, no hero — just a
// breadcrumb-style back link and the page identity, with the shell-avatar clear
// padding (pr-14) on the right.

import Link from "next/link";
import { ArrowLeft, Mic } from "lucide-react";

export function StudioHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-3 px-4 pr-14 sm:px-6">
        <Link
          href="/podcast/studio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Studio
        </Link>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Mic className="h-3.5 w-3.5" />
          </span>
          New episode
        </div>
      </div>
    </header>
  );
}
