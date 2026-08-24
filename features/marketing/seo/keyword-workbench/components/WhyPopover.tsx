"use client";

/**
 * THE (i) — and the loop it closes.
 *
 * Arman, 2026-08-23: "The 'Why this tier' is good information, but it's
 * completely useless when in a table. Because no one looks at a table and
 * wants to read an entire novel. So the point would be to have that as a
 * little tiny (i) symbol to see it on hover in a thin popover and then also
 * from a right click from the context menu that not only shows you the facts
 * but also allows you to click from there to go to where these rules and
 * numbers exist so you can modify them. That's the full loop that makes users
 * fall in love with a system."
 *
 * So: never a novel in a cell. A 3.5px icon, hover for the receipt, and under
 * it a door per step to the exact screen where the thing that produced it is
 * edited — the topic's worth, the value's worth, the combination, the geo
 * area. `ReasonChainDetail` (the value workbench's renderer) does the prose;
 * this file adds the doors, so there is still ONE explanation renderer.
 */

import Link from "next/link";
import { Info, PenLine } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { ReasonChainDetail } from "@/features/marketing/seo/value-system/workbench/ReasonChain";
import type {
  ValueReason,
  ValueSource,
} from "@/features/marketing/seo/value-system/types";

export interface WhyDoor {
  label: string;
  href: string;
}

/**
 * One door per KIND of step in the receipt — deduplicated, because a receipt
 * with nine stamps must not produce nine identical links to the Dimensions
 * screen.
 */
export function whyDoorsFor(
  reasons: ValueReason[],
  brandId: string | null | undefined,
  siteId: string,
): WhyDoor[] {
  const valuePath = (sub: string) =>
    marketingRoutes.site(brandId, siteId, `/value${sub}`);
  const doors = new Map<string, WhyDoor>();
  for (const reason of reasons) {
    switch (reason.kind) {
      case "topic":
        doors.set("topic", {
          label: "Edit topic worth",
          href: valuePath("/topics"),
        });
        break;
      case "stamp":
        doors.set("stamp", {
          label: "Edit dimensions & worth",
          href: valuePath("/dimensions"),
        });
        break;
      case "combo":
        doors.set("combo", {
          label: "Edit combinations",
          href: valuePath(""),
        });
        break;
      case "rule":
        doors.set("rule", { label: "Edit the rulebook", href: valuePath("/rules") });
        break;
      case "geo":
        doors.set("geo", {
          label: "Edit geo areas",
          href: valuePath("/rules?areas=all"),
        });
        break;
      case "override":
        doors.set("override", {
          label: "Review your rulings",
          href: valuePath(""),
        });
        break;
      default:
        break;
    }
  }
  return [...doors.values()];
}

/** The full receipt plus its doors — shared by the hover card and the panel. */
export function WhyBody({
  reasons,
  source,
  brandId,
  siteId,
}: {
  reasons: ValueReason[];
  source: ValueSource;
  brandId: string | null | undefined;
  siteId: string;
}) {
  const doors = whyDoorsFor(reasons, brandId, siteId);
  return (
    <div className="space-y-2">
      <ReasonChainDetail reasons={reasons} source={source} />
      {doors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
          {doors.map((door) => (
            <Link
              key={door.href}
              href={door.href}
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PenLine className="h-3 w-3" />
              {door.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WhyPopover({
  reasons,
  source,
  brandId,
  siteId,
}: {
  reasons: ValueReason[];
  source: ValueSource;
  brandId: string | null | undefined;
  siteId: string;
}) {
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Why this score"
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto p-3 scrollbar-thin"
      >
        <WhyBody
          reasons={reasons}
          source={source}
          brandId={brandId}
          siteId={siteId}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
