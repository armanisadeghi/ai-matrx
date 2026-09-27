"use client";

// features/crm/components/record/PartyOutputsSection.tsx
//
// "OUTPUTS ABOUT THIS CUSTOMER" — the reverse view, on the customer's own page
// (DD-131 slice 3 (d), chair 2026-09-13).
//
// THE SAME MECHANISM SLICE 2 BUILT FOR SITES, pointed at a party. Arman,
// 2026-09-12: data that already has a home gets the SAME grid with one filter
// chip, never a second list — and the mixed case becomes its own record that
// RELATES to the customer. This section is where those related records surface:
// the customer's own keys stay on the customer (the identity card above), and
// anything an agent produced ABOUT them that is not the customer's own data
// lands here as its own record with its own link.
//
// NOTHING HERE NAMES A KIND, and nothing here is CRM-specific except the words.
// `fetchRecordsForAnchor({type: "party", id})` reads the
// `content_ir_kind_instance -> party` edges through the registered associations
// chokepoint; the rows, the confirmation badge, the archive control, the honest
// empty state and the failure sentence all come from `AnchorRecordsList` — the
// same component the chat header's Records popover and the site overview
// render. An anchor is an anchor.
//
// 🚨 WHAT THIS LIST HONESTLY SHOWS TODAY: nothing, on every customer, and that
// is not a bug in this file. No live kind yet carries BOTH a customer's own
// keys and its own output keys — the "mixed case" — so nothing writes a
// kind-record → party edge. The chair deferred that split until a real kind
// exists rather than inventing one to fill this list. The section ships wired
// and honest: the moment such a kind is registered and emitted, its records
// appear here with no change to this file. The provenance of the CUSTOMER
// itself — who added this contact, and out of which chat — is a different
// question, answered by the Written-by column in the grid and the contact's own
// stamp, not by this list.

import {
  AnchorRecordsList,
  useAnchorRecords,
} from "@/features/content-ir/records/AnchorRecordsList";
import { SectionCard } from "./SectionCard";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export interface PartyOutputsSectionProps {
  partyId: string;
  /** The customer's display name — used in the words, never in the query. */
  partyName: string;
}

export function PartyOutputsSection({
  partyId,
  partyName,
}: PartyOutputsSectionProps) {
  const state = useAnchorRecords({ type: "party", id: partyId });

  // Absent until there is something to show (or a failure to say): an empty
  // "outputs" card with a paragraph explaining itself is the wall of empty
  // cards a thin record must never show. Loading is silent for the same reason.
  if (state.status === "loading") return null;
  if (state.status === "ready" && state.records.length === 0) return null;

  return (
    <SectionCard title="Outputs about this customer" Icon={AGENT_ICON}>
      <div className="p-2.5">
        <AnchorRecordsList
          state={state}
          loadingText={`Reading what has been produced about ${partyName}…`}
          emptyText={`Nothing produced about ${partyName} yet`}
        />
      </div>
    </SectionCard>
  );
}
