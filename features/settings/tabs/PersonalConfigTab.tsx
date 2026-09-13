"use client";

// Personal configuration — the USER rung of the scoped-configuration ladder
// (Code → System → Org → User; Arman 2026-08-27). Unlike every other settings
// tab, values here are NOT a Redux preference: they are platform.knob_override
// rows the SERVER resolves, so a pipeline honors exactly what this tab shows.
// Only knobs whose register row declares `user` in overridable_by appear; a
// user override is org-qualified (the same person may run two organizations
// with different policies), so the tab is scoped to one organization at a time.

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";

export default function PersonalConfigTab() {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);

  const { knobs, isLoading, error, refresh } = useScopedKnobs({
    organizationId,
    userId: userId ?? undefined,
  });

  const personal = useMemo(
    () => knobs.filter((knob) => knob.overridable_by.includes("user")),
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
      <SettingsSection
        title="Personal configuration"
        description="Settings your organization has opened to per-person override. Your value beats the organization's; clearing it inherits theirs."
      >
        {!organizationId && (
          <SettingsCallout tone="info" title="Choose an organization first">
            Personal configuration applies to the organization selected in the
            app header. Choose one there, then return to set an override.
          </SettingsCallout>
        )}
        {organizationId && error && (
          <SettingsCallout tone="warning">{error}</SettingsCallout>
        )}
        {organizationId && !isLoading && byFeature.length === 0 && (
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
