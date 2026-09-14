"use client";

/**
 * The canonical business-discovery surface for ONE site (KI-040).
 *
 * Mounted by the brand Knowledge route (`DiscoveryPage`) and by the floating
 * site discovery window — the same component in both, never a copy. It takes
 * its site binding as props so a window can render it outside the route's
 * marketing-site context.
 *
 * The proposals discovery produces (step 6's Offerings, the guidelines draft)
 * are ruled right here through the ONE approval queue (KI-045), narrowed to
 * those kinds — never a second list.
 */

import { ApprovalQueue } from "../approvals/ApprovalQueue";
import { ValueDoors } from "../ValueDoors";
import { DiscoveryLadder } from "./DiscoveryLadder";

/** The proposal kinds the Business Discovery Ladder emits. */
const DISCOVERY_PROPOSAL_KINDS = [
  "keyword_meaning:offering",
  "keyword_meaning:guideline_edit",
] as const;

export interface DiscoveryWorkspaceProps {
  siteId: string;
  brandId: string | null;
  organizationId: string | null;
  /** The site's domain or name, as the reader knows it. */
  siteLabel: string;
}

export function DiscoveryWorkspace({
  siteId,
  brandId,
  organizationId,
  siteLabel,
}: DiscoveryWorkspaceProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Let AI read{" "}
          <span className="font-medium text-foreground">{siteLabel}</span> cold
          and propose what it is, who pays it, what it offers and what each
          offering is worth — you rule every step.
        </p>
        {/* Discovery is what this surface IS — its own door is omitted. */}
        <ValueDoors brandId={brandId} siteId={siteId} showDiscovery={false} />
      </div>
      <ApprovalQueue
        scope={{ siteId, brandId, organizationId, siteLabel }}
        kinds={DISCOVERY_PROPOSAL_KINDS}
        title="Discovery proposals waiting on you"
        defaultExpanded
      />
      <DiscoveryLadder
        siteId={siteId}
        brandId={brandId}
        organizationId={organizationId}
        siteLabel={siteLabel}
      />
    </div>
  );
}
