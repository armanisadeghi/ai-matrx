"use client";

// features/settings/universal/UniversalSettingsPane.tsx
//
// The centre pane for ONE taxonomy section (`config.<domain>.<feature>`):
// the registry rows filed under that node, grouped and ordered by their `ui`
// hints, each rendered by the ONE editor (`KnobOverrideRow`, settings-ladder
// rule 2) at the rung this person edits:
//
//   • a key opened to people → the USER rung (their own value, org-qualified);
//   • a key opened to the organization only → the ORGANIZATION rung, which
//     an owner/admin edits here and a member sees explained with the
//     request door — never dead, never disabled-looking (law 4).
//
// The section it renders comes from the active-tab context the host provides
// (a tab component takes no props), so the same component serves the route,
// the window and the mobile drawer.

import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsNavigationRow } from "@/components/official/settings/SettingsNavigationRow";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { blastRadiusFor, compareKnobOrder, resolveKnobLadder } from "@/lib/scoped-config/ladder";
import type { KnobScopeKindName, ScopedKnob } from "@/lib/scoped-config/types";
import { useActiveSettingsTabId } from "../components/SettingsTabHost";
import { resolveConfigSection } from "./configTree";
import { useUniversalSettings } from "./UniversalSettingsContext";
import { SETTINGS_BASE, tabIdToHref } from "../route-shell/routing";
import { auditedSettingsDispositions, dispositionFor } from "./disposition";

export function UniversalSettingsRows({
  knobs,
  hideKey = false,
  onChanged,
}: {
  knobs: ScopedKnob[];
  hideKey?: boolean;
  onChanged?: () => void;
}) {
  const settings = useUniversalSettings();
  const {
    organizationId,
    userId,
    canManageOrganization,
    memberCount,
    organizationName,
  } = settings;
  if (settings.editingContext !== "system" && (!organizationId || !userId)) return null;

  const resolved = knobs.map((knob) => {
    const rung = settings.editingContext === "organization"
      ? { kind: "organization" as KnobScopeKindName, scopeId: null }
      : { kind: "user" as KnobScopeKindName, scopeId: null };
    return {
      knob,
      scopeKind: settings.editingContext === "system" ? "organization" : rung.kind,
      scopeId:
        settings.editingContext === "system" ? "platform" : rung.kind === "user" ? userId! : (rung.scopeId ?? organizationId ?? ""),
      ladder: resolveKnobLadder(knob, rung.kind, { isOrgAdmin: canManageOrganization }),
      group: knob.ui.group ?? knob.taxonomy?.feature_name ?? readableGroupName(knob.feature),
    };
  });
  const visible = settings.changedOnly
    ? resolved.filter(({ knob, ladder }) => settings.editingContext === "system"
      ? JSON.stringify(knob.platform_default) !== JSON.stringify(knob.shipped_default)
      : ladder.setHere)
    : resolved;
  if (settings.changedOnly && knobs.length > 0 && visible.length === 0) {
    return (
      <SettingsCallout tone="info" title="No changed settings in this section">
        No value is set at this level here. Turn off Changed only to view the
        settings that inherit their current values.
      </SettingsCallout>
    );
  }
  const groups = new Map<string, typeof resolved>();
  for (const row of visible) {
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }

  return (
    <>
      {[...groups.entries()].map(([group, rows]) => (
        <SettingsSection key={group} title={group}>
          {[...rows].sort(compareKnobOrder).map(({ knob, scopeKind, scopeId, ladder }) => (
            <KnobOverrideRow
              key={knob.full_key}
              knob={knob}
              scopeKind={scopeKind}
              scopeId={scopeId}
              organizationId={organizationId ?? ""}
              ladder={ladder}
              blastRadius={blastRadiusFor(scopeKind, {
                organizationName,
                members: memberCount,
              })}
              system={settings.editingContext === "system" ? {
                canWrite: settings.canManageSystem,
                registeredDefault: knob.shipped_default,
              } : undefined}
              stateOnly={dispositionFor(knob.full_key, settings.editingContext)}
              hideKey={hideKey}
              onChanged={onChanged ?? settings.refresh}
            />
          ))}
        </SettingsSection>
      ))}
    </>
  );
}

function readableGroupName(feature: string): string {
  return feature
    .split(/[._-]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Admin-only register audit. Counts are runtime facts, never a frozen baseline. */
export function RegistryCoverage() {
  const { knobs, canManageSystem } = useUniversalSettings();
  if (!canManageSystem) return null;
  const missingTaxonomy = knobs.filter((knob) => knob.taxonomy === null).length;
  const missingUi = knobs.filter((knob) => Object.keys(knob.ui).length === 0).length;
  const unsupported = knobs.filter((knob) => knob.value_type === "secret").length;
  return (
    <SettingsSection title="Registry coverage">
      <SettingsCallout tone="info" title={`${knobs.length} registered settings read`}>
        {missingTaxonomy} need taxonomy filing; {missingUi} rely on their typed control because they have no presentation metadata; {unsupported} secret value{unsupported === 1 ? " is" : "s are"} state-only and link to Vault. Older account, session, and device preferences remain outside this registry and are labeled at their own controls.
      </SettingsCallout>
      <SettingsCallout tone="warning" title="Known consumer gaps">
        {Object.values(auditedSettingsDispositions).filter((item) => item.stateOnlyAt.length > 0).length} audited settings have state-only contexts until their runtime consumer is connected. Table pagination and commerce labels do use the shared resolver.
      </SettingsCallout>
    </SettingsSection>
  );
}

export default function UniversalSettingsPane() {
  const tabId = useActiveSettingsTabId();
  const settings = useUniversalSettings();
  const section = tabId ? resolveConfigSection(tabId, settings.domains) : null;

  if (settings.isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <SuspenseLoader size="sm" message="Reading your configuration…" />
      </div>
    );
  }

  if (settings.error) {
    return (
      <div className="p-4">
        <SettingsCallout tone="error" title="Configuration could not be read">
          <p>{settings.error}</p>
          <div className="mt-3">
            <SettingsButton
              label="Configuration"
              actionLabel="Try again"
              onClick={settings.refresh}
            />
          </div>
        </SettingsCallout>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="p-4">
        <SettingsCallout tone="warning" title="Nothing is filed here">
          This section has no settings for the organization you are looking at.
          Pick another section from the list.
        </SettingsCallout>
      </div>
    );
  }

  const missingHere = section.knobs.filter((knob) => knob.origin === "missing");
  const hasNoRegisteredControls = section.knobs.length === 0;

  return (
    <>
      <SettingsSubHeader
        title={section.title}
        description={
          section.feature
            ? `${section.domain.name} › ${section.feature.name}`
            : `Settings that apply across ${section.domain.name}.`
        }
      />
      {settings.editingContext === "system" && <RegistryCoverage />}
      {section.feature === null && <DomainChildNavigation section={section} />}
      {hasNoRegisteredControls && (
        <SettingsCallout tone="info" title="No controls are registered yet">
          This category is part of the product structure, but it does not have
          configurable controls yet. It remains here so the settings map stays
          complete as controls are added.
        </SettingsCallout>
      )}
      {missingHere.length > 0 && (
        <SettingsCallout tone="error" title="Some settings resolved to nothing">
          {missingHere.map((knob) => knob.full_key).join(", ")} — the register and the
          code disagree. Nothing is hidden; those rows show no value.
        </SettingsCallout>
      )}
      <UniversalSettingsRows knobs={section.knobs} />
    </>
  );
}

function DomainChildNavigation({
  section,
}: {
  section: NonNullable<ReturnType<typeof resolveConfigSection>>;
}) {
  if (section.domain.features.length === 0) return null;
  return (
    <SettingsSection
      title="Categories"
      description="Choose a product area to view its configurable controls and coverage."
    >
      {section.domain.features.map((feature, index) => (
        <SettingsNavigationRow
          key={feature.id}
          href={tabIdToHref(SETTINGS_BASE, feature.id)}
          label={feature.name}
          description={feature.knobs.length === 0
            ? "No controls registered yet"
            : `${feature.knobs.length} setting${feature.knobs.length === 1 ? "" : "s"}`}
          last={index === section.domain.features.length - 1}
        />
      ))}
    </SettingsSection>
  );
}
