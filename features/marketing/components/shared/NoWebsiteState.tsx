"use client";

/**
 * The one honest state for a brand page that is about a WEBSITE when the brand has none
 * (social-first brands: a person, a creator, a shop that lives on Instagram).
 *
 * It names what the page needs a website for, offers the one next step (Add website), and
 * always carries the doors to what the brand CAN do without one. Never a bare refusal.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Globe, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export interface NoWebsiteStateProps {
  brandId: string;
  brandName: string;
  /** What this page does with a website, as a short phrase: "keyword research and rankings". */
  needs: string;
  /** What the brand can do instead, as doors. */
  alternatives?: { label: string; href: string }[];
  /** Compact: no centering, for sitting below other content. */
  compact?: boolean;
  children?: ReactNode;
}

export function NoWebsiteState({
  brandId,
  brandName,
  needs,
  alternatives,
  compact = false,
  children,
}: NoWebsiteStateProps) {
  const doors = alternatives ?? [
    { label: "Open Socials", href: marketingRoutes.brandSocials(brandId) },
  ];
  return (
    <div
      data-testid="no-website-state"
      className={
        compact
          ? "rounded-lg border border-border bg-card p-4"
          : "mx-auto w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center"
      }
    >
      <div className={compact ? "flex items-start gap-3" : undefined}>
        <Globe
          className={compact ? "mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" : "mx-auto h-5 w-5 text-muted-foreground"}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="mt-2 text-sm font-medium text-foreground first:mt-0">
            {brandName} is social-first: no website yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This page uses a website for {needs}. Add one and it fills in; until then everything the brand does on its
            social accounts works without it.
          </p>
          {children}
          <div className={compact ? "mt-3 flex flex-wrap gap-2" : "mt-3 flex flex-wrap justify-center gap-2"}>
            <Button variant="primary" asChild>
              <Link href={marketingRoutes.newSite(brandId)}>
                <Plus className="h-3.5 w-3.5" />
                Add website
              </Link>
            </Button>
            {doors.map((door) => (
              <Button key={door.href} variant="outline" asChild>
                <Link href={door.href}>{door.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
