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

import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
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
import {
  isSubOrgScopeKind,
  scopeKindNoun,
  SUB_ORG_SCOPE_KINDS,
  type SubOrgScopeKind,
} from "./scopeRows";

/**
 * The rung a person edits a key at on this surface: their own rung when the
 * key is opened to people; otherwise the nearest sub-org rung they are
 * standing inside that the key names (this pay group, this site, …);
 * otherwise the organization. Nearest rung wins, exactly as the resolver
 * ranks them, so the row a person edits is the row that decides the value.
 */
export function editRungFor(
  knob: ScopedKnob,
  selectedScopes: Partial<Record<SubOrgScopeKind, string>>,
): { kind: KnobScopeKindName; scopeId: string | null } {
  if (knob.overridable_by.includes("user")) return { kind: "user", scopeId: null };
  const addressed = [...knob.scope_chain]
    .reverse()
    .find(
      (rung) =>
        isSubOrgScopeKind(rung.kind) && selectedScopes[rung.kind] !== undefined,
    );
  if (addressed && isSubOrgScopeKind(addressed.kind)) {
    return { kind: addressed.kind, scopeId: selectedScopes[addressed.kind] ?? null };
  }
  if (knob.overridable_by.includes("organization")) return { kind: "organization", scopeId: null };
  return { kind: knob.overridable_by[0] ?? "organization", scopeId: null };
}

export function UniversalSettingsRows({
  knobs,
  hideKey = false,
}: {
  knobs: ScopedKnob[];
  hideKey?: boolean;
}) {
  const settings = useUniversalSettings();
  const {
    organizationId,
    userId,
    canManageOrganization,
    memberCount,
    organizationName,
    selectedScopes,
  } = settings;
  if (settings.editingContext !== "system" && (!organizationId || !userId)) return null;

  const resolved = knobs.map((knob) => {
    const rung = settings.editingContext === "organization"
      ? { kind: "organization" as KnobScopeKindName, scopeId: null }
      : editRungFor(knob, selectedScopes);
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
              onChanged={settings.refresh}
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

/** The organization the values belong to, when the person has several. */
export function OrganizationRungSection() {
  const { organizations, organizationId, selectOrganization } = useUniversalSettings();
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <label htmlFor="settings-organization" className="shrink-0 text-muted-foreground">Organization</label>
      <select id="settings-organization" className="h-8 min-w-0 max-w-56 rounded-md border border-border bg-background px-2" value={organizationId ?? ""} onChange={(event) => selectOrganization(event.target.value)}>
        {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
      </select>
    </div>
  );
}

/** Shared context selector used by the first screen and every registry section. */
export function SettingsContextControls() {
  const { editingContext, selectEditingContext, canManageSystem, organizationName, changedOnly, setChangedOnly } = useUniversalSettings();
  const options = [
    { value: "user", label: "Personal" },
    { value: "organization", label: "Organization" },
    ...(canManageSystem ? [{ value: "system", label: "System" }] : []),
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
      {editingContext === "system" ? <ShieldCheck className="h-4 w-4 text-muted-foreground" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
      <label htmlFor="settings-context" className="text-muted-foreground">Editing</label>
      <select id="settings-context" className="h-8 rounded-md border border-border bg-background px-2" value={editingContext} onChange={(event) => selectEditingContext(event.target.value as "user" | "organization" | "system")}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {editingContext !== "system" && <OrganizationRungSection />}
      <label className="ml-auto flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} /> Changed only</label>
      <span className="basis-full text-xs text-muted-foreground">{editingContext === "system" ? "Platform defaults apply where no lower-level value exists." : `${editingContext === "user" ? "Personal" : "Organization"} values apply in ${organizationName ?? "the selected organization"}.`}</span>
    </div>
  );
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
        {Object.keys(auditedSettingsDispositions).length} audited settings have state-only lower-level rows until their runtime consumer is connected. Table pagination and commerce labels do use the shared resolver.
      </SettingsCallout>
    </SettingsSection>
  );
}

/**
 * "Standing inside" — the sub-org rungs this section's keys name (pay group,
 * location, brand, site, employer profile). Picking a row addresses that rung
 * on the read, shows it in every field's ladder, and makes it the rung an
 * organization-level key is edited at. A rung the host page fixed (a brand's
 * own settings page) is shown, not pickable.
 */
/** Select item values cannot be "" — a sentinel stands for "no sub-org rung". */
const WHOLE_ORGANIZATION = "__whole_organization__";
/** The provider's marker for a rung whose rows could not be listed. */
export const UNLISTABLE = "__unlistable__";

export function SubOrgRungSection({ knobs }: { knobs: ScopedKnob[] }) {
  const { selectedScopes, selectScope, scopeRows, hostScopeKinds } = useUniversalSettings();
  const kinds = SUB_ORG_SCOPE_KINDS.filter((kind) =>
    knobs.some((knob) => knob.overridable_by.includes(kind)),
  );
  if (kinds.length === 0) return null;
  return (
    <SettingsSection
      title="Standing inside"
      description="These settings can also be set for one part of the organization. Pick the one you mean; leave it empty to work at the organization level."
    >
      {kinds.map((kind, index) => {
        const rows = scopeRows[kind] ?? [];
        const fixed = hostScopeKinds.includes(kind);
        const value = selectedScopes[kind] ?? WHOLE_ORGANIZATION;
        return (
          <SettingsSelect
            key={kind}
            label={scopeKindNoun(kind)}
            description={
              fixed
                ? "Fixed by the page you opened settings from."
                : rows.length === 0
                  ? `No ${scopeKindNoun(kind).toLowerCase()} rows exist in this organization yet.`
                  : `Applies to everyone in that ${scopeKindNoun(kind).toLowerCase()} who has not set their own value.`
            }
            value={value}
            disabled={fixed || rows.length === 0}
            options={[
              { value: WHOLE_ORGANIZATION, label: "Whole organization" },
              ...rows.map((row) => ({
                value: row.id,
                label: row.label,
                disabled: row.id === UNLISTABLE,
              })),
            ]}
            onValueChange={(next) =>
              selectScope(kind, next === WHOLE_ORGANIZATION ? null : next)
            }
            last={index === kinds.length - 1}
          />
        );
      })}
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
      <SettingsContextControls />
      {settings.editingContext === "system" && <RegistryCoverage />}
      {settings.editingContext !== "system" && <SubOrgRungSection knobs={section.knobs} />}
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
