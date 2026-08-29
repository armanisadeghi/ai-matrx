"use client";

/**
 * StoreConnectShell — the onboarding + store-connect UI shell
 * (/commerce/stores/connect). W6 owns the OAuth routes that will fill the
 * Connect step; until they land the button announces the registered
 * Coming-Soon promise (`commerce.store-connect-oauth`) — a tracked promise,
 * never a dead click or a silent failure.
 */

import React from "react";
import { CheckCircle2, Circle, Store } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";

const buildSteps = (
  organizationId: string | null,
): {
  title: string;
  detail: string;
  done: boolean;
  href?: string;
}[] => [
  {
    title: "Set your organization's configuration",
    detail:
      "Hold days, triage mode, cost budgets — every pipeline decision is a setting you control.",
    done: false,
    // The org rung of the ONE scoped-configuration ladder — never a
    // commerce-local settings page (that parallel surface was deleted
    // 2026-08-29 per no-legacy; Arman's ruling).
    href: organizationId
      ? `/organizations/${organizationId}/settings/configuration`
      : "/organizations",
  },
  {
    title: "Connect your eBay store",
    detail:
      "Authorize the store so listings, orders and inventory sync both ways.",
    done: false,
  },
  {
    title: "Capture your first items",
    detail: "Open the camera-first intake app and shoot your first batch.",
    done: false,
    href: "/commerce/intake",
  },
];

export function StoreConnectShell() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const steps = buildSteps(organizationId);
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            Get your store selling through the pipeline
          </h2>
        </div>
        <ol className="mt-4 space-y-4">
          {steps.map((step) => (
            <li key={step.title} className="flex gap-3">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
                {step.href ? (
                  <Button asChild variant="outline" size="sm" className="mt-1.5">
                    <Link href={step.href}>Open</Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="mt-1.5"
                    onClick={() => void announceComingSoon("commerce.store-connect-oauth")}
                  >
                    Connect eBay store
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-xs text-muted-foreground">
        Connecting authorizes only the store you pick, and you can disconnect it
        at any time. Nothing is listed or changed without your review — every
        AI draft waits for your approval in{" "}
        <Link href="/commerce/drafts" className="underline hover:text-foreground">
          Drafts Review
        </Link>
        .
      </p>
    </div>
  );
}
