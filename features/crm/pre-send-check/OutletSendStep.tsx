"use client";

// features/crm/pre-send-check/OutletSendStep.tsx
//
// The outreach list's send step: recipients grouped by outlet, one "Pitch first"
// per outlet (the one-per-outlet rule, matrx-same-outlet-ranker), the others
// held until the pitch's live window (`pr.pitch_live_days`) has passed. The
// server proposes the pick (best stored fit, then list order); the person can
// change it, or turn holding off and send to everyone. Never a gate.

import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { RecipientFitBadge } from "./RecipientFitBadge";
import type { OutletGroup, RecipientFit } from "./service";
import type { PreSendCheckState } from "./usePreSendCheck";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface OutletPicks {
  /** outlet party id → the recipient party id to pitch first. */
  firstByOutlet: Record<string, string>;
  /** Hold the others at each shared outlet. Off = everyone goes now. */
  holdOthers: boolean;
}

/** Shared outlets only: an outlet with one recipient has nothing to pick. */
export function sharedOutlets(groups: readonly OutletGroup[]): OutletGroup[] {
  return groups.filter((g) => g.outlet_party_id && g.recipient_party_ids.length > 1);
}

export function defaultPicks(groups: readonly OutletGroup[]): OutletPicks {
  const firstByOutlet: Record<string, string> = {};
  for (const g of sharedOutlets(groups)) {
    firstByOutlet[g.outlet_party_id as string] = g.pitch_first_party_id;
  }
  return { firstByOutlet, holdOthers: true };
}

/** The members to hold, with when: everyone at a shared outlet except the pick. */
export function membersToHold(
  groups: readonly OutletGroup[],
  recipients: readonly RecipientFit[],
  picks: OutletPicks,
): { memberId: string; until: string }[] {
  if (!picks.holdOthers) return [];
  const memberOf = new Map(recipients.map((r) => [r.party_id, r.member_id ?? null]));
  const held: { memberId: string; until: string }[] = [];
  for (const g of sharedOutlets(groups)) {
    const first = picks.firstByOutlet[g.outlet_party_id as string] ?? g.pitch_first_party_id;
    for (const partyId of g.recipient_party_ids) {
      const memberId = memberOf.get(partyId);
      if (partyId !== first && memberId && g.hold_until) held.push({ memberId, until: g.hold_until });
    }
  }
  return held;
}

export function OutletSendStep({
  state,
  picks,
  onPicksChange,
}: {
  state: PreSendCheckState;
  picks: OutletPicks;
  onPicksChange: (next: OutletPicks) => void;
}) {
  const { report, running, error } = state;
  if (running && !report) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Grouping recipients by outlet…
      </p>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive">Outlet grouping did not run: {error}<ErrorAlchemyMenu error={error} /></p>;
  }
  if (!report) return null;
  const groups = sharedOutlets(report.outlets ?? []);
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="outlet-send-step-empty">
        No two recipients share an outlet.
      </p>
    );
  }
  const byParty = new Map((report.recipients ?? []).map((r) => [r.party_id, r]));
  const heldCount = groups.reduce((n, g) => n + g.recipient_party_ids.length - 1, 0);

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm" data-testid="outlet-send-step">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">One pitch per outlet</p>
        <div className="flex items-center gap-2">
          <Label htmlFor="outlet-hold-others" className="text-xs text-muted-foreground">
            Hold the others ({heldCount})
          </Label>
          <Switch
            id="outlet-hold-others"
            checked={picks.holdOthers}
            onCheckedChange={(checked) => onPicksChange({ ...picks, holdOthers: checked })}
          />
        </div>
      </div>
      {groups.map((g) => {
        const outletId = g.outlet_party_id as string;
        const chosen = picks.firstByOutlet[outletId] ?? g.pitch_first_party_id;
        return (
          <div key={outletId} className="space-y-1" data-testid="outlet-group">
            <p className="text-xs font-medium">
              {g.outlet_name ?? "Outlet"} · {g.recipient_party_ids.length} recipients
            </p>
            <RadioGroup
              value={chosen}
              onValueChange={(value) =>
                onPicksChange({ ...picks, firstByOutlet: { ...picks.firstByOutlet, [outletId]: value } })
              }
            >
              {g.recipient_party_ids.map((partyId) => {
                const r = byParty.get(partyId);
                const id = `pitch-first-${outletId}-${partyId}`;
                return (
                  <div key={partyId} className="flex items-center gap-2">
                    <RadioGroupItem value={partyId} id={id} />
                    <Label htmlFor={id} className="flex flex-wrap items-center gap-2 text-xs font-normal">
                      {r?.name ?? "Recipient"}
                      {r && <RecipientFitBadge fit={r} />}
                      {partyId === chosen ? (
                        <span className="font-medium">Pitch first</span>
                      ) : picks.holdOthers ? (
                        <span className="text-muted-foreground">
                          Held to {g.hold_until ? new Date(g.hold_until).toLocaleDateString() : "later"}
                        </span>
                      ) : null}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">{g.why}</p>
          </div>
        );
      })}
    </div>
  );
}
