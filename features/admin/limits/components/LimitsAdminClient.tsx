"use client";

// Users & Access › Limits & Knobs — the one place every limit on the platform
// can be changed without a deploy.
//
// Authority: common-docs/policies/limits-are-knobs-agents-set-them.md.
// The tabs are the halves of that policy and the lines between them matter:
// an ALLOWANCE belongs to a plan and lives in billing.plan_limit; an ADD-ON
// belongs to one org and only ever RAISES its plan's allowance
// (billing.account_addon); a KNOB belongs to the platform and lives in
// platform.feature_knob. Putting an allowance in a knob (or vice versa) is how
// the platform grows a second level ladder — see
// common-docs/systems/platform/entitlements-knobs/PLAN_MODEL.md.
//
// This page decides what an account MAY use. What an account HAS used lives
// on two sibling surfaces, linked from the header so nobody treats this as a
// third, disconnected place: the knowledge cost board and per-user usage.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountAddonsPanel } from "./AccountAddonsPanel";
import { FeatureKnobsPanel } from "./FeatureKnobsPanel";
import { PlanAllowancesPanel } from "./PlanAllowancesPanel";

const SIBLING_SURFACES = [
  { href: "/administration/knowledge/kg-cost", label: "Knowledge cost" },
  { href: "/administration/users/usage", label: "Usage by user" },
] as const;

export function LimitsAdminClient() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h2 className="text-xl font-semibold">Limits &amp; Knobs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan allowances are what a plan gives every account on it. Account
          add-ons raise one org above its plan. Feature knobs are the
          operational ceilings and defaults that belong to no account. All of
          it is data — changing any of it is a row, never a deploy.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>What accounts have actually used:</span>
          {SIBLING_SURFACES.map((surface) => (
            <Link
              key={surface.href}
              href={surface.href}
              className="inline-flex items-center gap-0.5 underline-offset-4 hover:text-foreground hover:underline"
            >
              {surface.label}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ))}
        </p>
      </header>
      <Tabs defaultValue="allowances">
        <TabsList>
          <TabsTrigger value="allowances">Plan allowances</TabsTrigger>
          <TabsTrigger value="addons">Account add-ons</TabsTrigger>
          <TabsTrigger value="knobs">Feature knobs</TabsTrigger>
        </TabsList>
        <TabsContent value="allowances" className="mt-6">
          <PlanAllowancesPanel />
        </TabsContent>
        <TabsContent value="addons" className="mt-6">
          <AccountAddonsPanel />
        </TabsContent>
        <TabsContent value="knobs" className="mt-6">
          <FeatureKnobsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
