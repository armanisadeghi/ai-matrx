"use client";

// Users & Access › Limits & Knobs — the one place every limit on the platform
// can be changed without a deploy.
//
// Authority: common-docs/policies/limits-are-knobs-agents-set-them.md.
// The two tabs are the two halves of that policy and the line between them
// matters: an ALLOWANCE belongs to an account and lives in billing; a KNOB
// belongs to the platform and lives in platform.feature_knob. Putting an
// allowance in a knob (or vice versa) is how the platform grows a second level
// ladder — see common-docs/systems/entitlements-and-tiers/PLAN_MODEL.md.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureKnobsPanel } from "./FeatureKnobsPanel";
import { PlanAllowancesPanel } from "./PlanAllowancesPanel";

export function LimitsAdminClient() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h2 className="text-xl font-semibold">Limits &amp; Knobs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan allowances are what an account gets. Feature knobs are the
          operational ceilings and defaults that belong to no account. Both are
          data — changing either is a row, never a deploy.
        </p>
      </header>
      <Tabs defaultValue="allowances">
        <TabsList>
          <TabsTrigger value="allowances">Plan allowances</TabsTrigger>
          <TabsTrigger value="knobs">Feature knobs</TabsTrigger>
        </TabsList>
        <TabsContent value="allowances" className="mt-6">
          <PlanAllowancesPanel />
        </TabsContent>
        <TabsContent value="knobs" className="mt-6">
          <FeatureKnobsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
