"use client";

// features/unified-data/components/UnifiedDataSwitchNotice.tsx
//
// THE ONE THING EVERY RECORD-STORE SURFACE SAYS WHEN IT IS NOT SHOWING RECORDS.
//
// 🚨 WHY IT EXISTS (lane SHARE-OUT, item 3, 21 September). Five screens each had
// their own `!campaign.on ? <p>{campaign.because}</p> : …`, and `because` was
// driven by a boolean that meant BOTH "switched off" and "the read failed". So
// during a transient PostgREST schema-cache reload — another lane's DDL —
// `/data-v2` told a person, as a fact, that their organization does not keep its
// data in the unified record store, about an organization whose switch was
// demonstrably `true` (lane PEEK-SHARE, §6). A failed check is "could not check
// — retry"; it is never a statement about somebody's organization.
//
// Fixing it in five `page.tsx` files would fix five instances. This is the
// class: one component, four states, and the retry lives with the sentence that
// needs it. A new record-store surface inherits the honest branch by using it.
//
// Guard: `pnpm check:failed-check-is-not-a-fact` (+ `:self-test`).

import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UnifiedDataCampaignGate } from "@/lib/knobs/useUnifiedDataCampaignGate";

export interface UnifiedDataSwitchNoticeProps {
  /** The gate exactly as `useUnifiedDataCampaign` returned it. */
  gate: UnifiedDataCampaignGate;
  /** What this screen is, for the resolving line. e.g. "Data records". */
  what?: string;
  /**
   * The person arrived by an OLDER-table link that redirected here, because that table
   * was moved into the record store (OLD-TABLES-CUTOVER W7). When the gate is `on`, the
   * notice says so in one line instead of rendering nothing; a link that silently lands
   * somewhere new is a link that lies about where the person is.
   */
  movedFromOlderTable?: boolean;
}

/** The one sentence a moved table's old link lands on. */
export const MOVED_FROM_OLDER_TABLE_SENTENCE =
  "This table moved to its new home; the older copy is archived and can be brought back.";

/**
 * Renders the gate's non-`on` states and, for `on`, nothing — unless the person arrived by
 * a moved older table's link, when it says so in one line. A caller reads:
 *
 *   {gate.state === "on" ? <TheRealScreen/> : <UnifiedDataSwitchNotice gate={gate}/>}
 */
export function UnifiedDataSwitchNotice({ gate, what, movedFromOlderTable }: UnifiedDataSwitchNoticeProps) {
  if (gate.state === "on") {
    return movedFromOlderTable ? (
      <p className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" role="status">
        {MOVED_FROM_OLDER_TABLE_SENTENCE}
      </p>
    ) : null;
  }

  // RESOLVING is not an answer and never wears an answer's clothes.
  if (gate.state === "resolving") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{what ? `Checking whether ${what} are available here…` : gate.because}</span>
      </div>
    );
  }

  // COULD NOT CHECK. It states nothing about the organization, and the remedy is
  // to try again — not the remedy for a switch that is genuinely off.
  if (gate.state === "unavailable") {
    return (
      <div className="max-w-2xl rounded-lg border border-destructive/20 bg-destructive/10 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              We could not check this organization&apos;s record store
            </p>
            <p className="mt-0.5 text-xs text-destructive/80">{gate.because}</p>
            {/* The cause is for whoever is debugging at three in the morning, and
                it is on the screen rather than only in a console nobody opens. */}
            {gate.cause ? (
              <p className="mt-1 text-xs text-muted-foreground break-words">{gate.cause}</p>
            ) : null}
          </div>
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={gate.retry}>
          Try again
        </Button>
      </div>
    );
  }

  // GENUINELY OFF. ONE sentence, in plain English, naming the one thing that
  // turns it on — never a knob key, and never two sentences saying it twice.
  return <p className="max-w-2xl text-sm opacity-80">{gate.because}</p>;
}
