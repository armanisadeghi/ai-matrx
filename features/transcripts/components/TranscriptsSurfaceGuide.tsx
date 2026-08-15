"use client";

// features/transcripts/components/TranscriptsSurfaceGuide.tsx
//
// The wayfinding half of the retired `TranscriptionLanding` page, ported to
// where it belongs.
//
// /transcripts is the canonical entry LIST view (CLAUDE.md § "Feature entry
// pages are LIST views"), so the old landing page lost its slot legitimately —
// but the explanation it carried had nowhere to go. The route names four
// capture surfaces (Process / Studio / Scribe / Clean) whose names mean nothing
// to a first-time user, which is THE DOOR LAW's exact failure: a surface the UI
// names but the user cannot decode is unreachable in practice.
//
// So it renders ONLY inside the empty state, never above the list. A user with
// transcripts sees their list and nothing else — zero page shift, ever. The
// same blurbs also ride the header mode nav's tooltips, from the one register
// in `constants/transcriptsRoutes.ts`.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TRANSCRIPTS_MODES } from "@/features/transcripts/constants/transcriptsRoutes";

/** Capture surfaces only — "All" is this page and "New" is the header button. */
const SURFACE_IDS = ["studio", "processor", "scribe", "cleanup"] as const;

const SURFACES = SURFACE_IDS.map(
  (id) => TRANSCRIPTS_MODES.find((m) => m.id === id)!,
);

export function TranscriptsSurfaceGuide() {
  return (
    <div className="mt-4 w-full max-w-full sm:w-[34rem]">
      <p className="mb-2 text-left text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
        Four ways to capture
      </p>
      <ul className="flex flex-col gap-1.5">
        {SURFACES.map(({ id, label, icon: Icon, href, blurb }) => (
          <li key={id}>
            <Link
              href={href}
              className="group flex min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  {label}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {blurb}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
