"use client";

/**
 * ScopedConfigPanel — the commerce-scoped view over the ONE scoped-configuration
 * primitive (/commerce/settings). A thin filter on the canonical stack in
 * `lib/scoped-config/` — `useScopedKnobs` (platform.knob_index) for the read,
 * `KnobOverrideRow` for every editor row, `platform.knob_override_set` (via the
 * row) for the write. No commerce-specific read or write path exists.
 *
 * Two tabs:
 * - **Organization** — commerce.* and batch.deadline knobs whose
 *   `overridable_by` includes `organization`, written at org scope. The door is
 *   org-admin gated server-side; non-admins see values and get a structured
 *   refusal if they try to save.
 * - **My settings** — the subset whose `overridable_by` includes `user`,
 *   written at user scope (org-qualified).
 *
 * The org-wide surface across ALL features is
 * /organizations/[orgId]/settings/configuration; the user-wide one is the
 * Personal configuration settings tab. This page is only the commerce lens.
 */

import React, { useMemo } from "react";
import { SlidersHorizontal, UserRound } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserRole } from "@/features/organizations/hooks";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import type { ScopedKnob } from "@/lib/scoped-config/types";

/** The knobs this commerce surface curates: the commerce features plus the
 *  batch-deadline knobs commerce pipelines ride. */
function isCommerceScoped(knob: ScopedKnob): boolean {
  return (
    knob.feature === "commerce" ||
    knob.feature.startsWith("commerce.") ||
    knob.full_key.startsWith("batch.deadline")
  );
}

export function ScopedConfigPanel() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const { isAdmin } = useUserRole(organizationId ?? undefined);
  const { knobs, isLoading, error, refresh, missing } = useScopedKnobs({
    organizationId,
    userId: userId ?? undefined,
  });

  const commerceKnobs = useMemo(() => knobs.filter(isCommerceScoped), [knobs]);
  const orgKnobs = useMemo(
    () => commerceKnobs.filter((k) => k.overridable_by.includes("organization")),
    [commerceKnobs],
  );
  const userKnobs = useMemo(
    () => commerceKnobs.filter((k) => k.overridable_by.includes("user")),
    [commerceKnobs],
  );

  if (!organizationId) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Pick an organization to manage its configuration.
      </p>
    );
  }
  if (error) {
    return <p className="p-6 text-sm text-destructive">{error}</p>;
  }
  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="org" className="w-full">
      <TabsList>
        <TabsTrigger value="org" className="gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Organization
        </TabsTrigger>
        <TabsTrigger value="user" className="gap-1.5">
          <UserRound className="h-3.5 w-3.5" /> My settings
        </TabsTrigger>
      </TabsList>

      {missing.some(isCommerceScoped) && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Some commerce configuration keys resolved to nothing — the register
          and the code disagree.
        </p>
      )}

      <TabsContent value="org">
        {!isAdmin && (
          <p className="mb-3 text-xs text-muted-foreground">
            You can see your organization&apos;s configuration; only an
            organization admin can change it.
          </p>
        )}
        <KnobGroups
          knobs={orgKnobs}
          scopeKind="organization"
          scopeId={organizationId}
          organizationId={organizationId}
          blastRadius="Applies to everyone in this organization."
          emptyText="No organization-overridable commerce settings are registered yet."
          onChanged={refresh}
        />
      </TabsContent>

      <TabsContent value="user">
        <KnobGroups
          knobs={userKnobs}
          scopeKind="user"
          scopeId={userId ?? ""}
          organizationId={organizationId}
          blastRadius="Applies only to you, in this organization."
          emptyText="No commerce settings are personal-overridable yet."
          onChanged={refresh}
        />
      </TabsContent>
    </Tabs>
  );
}

function KnobGroups({
  knobs,
  scopeKind,
  scopeId,
  organizationId,
  blastRadius,
  emptyText,
  onChanged,
}: {
  knobs: ScopedKnob[];
  scopeKind: "organization" | "user";
  scopeId: string;
  organizationId: string;
  blastRadius: string;
  emptyText: string;
  onChanged: () => void;
}) {
  if (knobs.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{emptyText}</p>;
  }
  const features = [...new Set(knobs.map((k) => k.feature))].sort();
  return (
    <div className="space-y-6">
      {features.map((feature) => (
        <section key={feature}>
          <h2 className="mb-2 font-mono text-sm font-semibold text-foreground">
            {feature}
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {knobs
              .filter((k) => k.feature === feature)
              .map((knob) => (
                <KnobOverrideRow
                  key={knob.full_key}
                  knob={knob}
                  scopeKind={scopeKind}
                  scopeId={scopeId}
                  organizationId={organizationId}
                  blastRadius={blastRadius}
                  onChanged={onChanged}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
