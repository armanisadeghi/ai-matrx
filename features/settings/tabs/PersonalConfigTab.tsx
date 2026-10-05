"use client";

// Personal configuration — the USER rung of the scoped-configuration ladder
// (Code → System → Org → User; Arman 2026-08-27). Unlike every other settings
// tab, values here are NOT a Redux preference: they are platform.knob_override
// rows the SERVER resolves, so a pipeline honors exactly what this tab shows.
// Only knobs whose register row declares `user` in overridable_by appear; a
// user override is org-qualified (the same person may run two organizations
// with different policies), so the tab is scoped to one organization at a time.

import { useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { resolveKnobLadder } from "@/lib/scoped-config/ladder";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { isCompanionKnob } from "@/lib/scoped-config/modelClassCompanion";

export default function PersonalConfigTab() {
  const userId = useAppSelector(selectUserId);
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const memberships = useAppSelector(selectOrganizationsList);
  // A personal override is org-qualified BY MEANING, so this tab's subject is one
  // organization at a time — chosen HERE, on the page, from every organization the
  // person belongs to. It only OPENS on the active one; changing it never touches
  // the header's active organization, and the header never moves it (active-org
  // law: the two org concepts never sync).
  const [chosenOrganizationId, setChosenOrganizationId] = useState<
    string | null
  >(null);
  const organizationId =
    chosenOrganizationId ?? activeOrganizationId ?? null;

  const { knobs, isLoading, error, refresh } = useScopedKnobs({
    organizationId,
    userId: userId ?? undefined,
  });

  const personal = useMemo(
    () =>
      knobs.filter(
        (knob) => knob.overridable_by.includes("user") && !isCompanionKnob(knob),
      ),
    [knobs],
  );
  const byFeature = useMemo(() => {
    const groups = new Map<string, typeof personal>();
    for (const knob of personal) {
      const list = groups.get(knob.feature) ?? [];
      list.push(knob);
      groups.set(knob.feature, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [personal]);

  if (!userId) return null;

  return (
    <div className="space-y-6">
      {/* Settings the organization opened to per-person override. The person's
          value beats the organization's; clearing it inherits theirs. */}
      <SettingsSection title="Personal configuration">
        {memberships.length > 1 && organizationId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-muted-foreground">Organization</span>
            <Select
              value={organizationId}
              onValueChange={setChosenOrganizationId}
            >
              <SelectTrigger
                className="w-64 min-w-0"
                aria-label="Organization whose personal configuration to show"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!organizationId && (
          <SettingsCallout tone="info" title="You have no organization yet">
            Personal configuration is set per organization. Join or create one,
            then return to set an override.
          </SettingsCallout>
        )}
        {organizationId && error && (
          <SettingsCallout tone="warning">{error} <ErrorAlchemyMenu error={error} /></SettingsCallout>
        )}
        {organizationId && !isLoading && !error && byFeature.length === 0 && (
          <SettingsCallout tone="info">
            Nothing here yet: none of your organizations&rsquo; settings are
            currently opened to personal override. When an administrator marks a
            configuration as per-person, it appears here automatically — no
            update needed.
          </SettingsCallout>
        )}
      </SettingsSection>
      {organizationId &&
        byFeature.map(([feature, rows]) => (
          <SettingsSection key={feature} title={feature}>
            <div className="divide-y divide-border rounded-lg border border-border">
              {rows.map((knob) => (
                <KnobOverrideRow
                  key={knob.full_key}
                  knob={knob}
                  scopeKind="user"
                  scopeId={userId}
                  // The same ladder the universal pane hands its rows: without
                  // it every row fell back to a raw text box (a model setting
                  // showed a uuid, with no picker and no class choice).
                  ladder={resolveKnobLadder(knob, "user")}
                  organizationId={organizationId ?? ""}
                  blastRadius="Applies only to you, in this organization."
                  onChanged={refresh}
                />
              ))}
            </div>
          </SettingsSection>
        ))}
    </div>
  );
}
