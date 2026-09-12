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
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { blastRadiusFor, compareKnobOrder, resolveKnobLadder } from "@/lib/scoped-config/ladder";
import type { KnobScopeKindName, ScopedKnob } from "@/lib/scoped-config/types";
import { useActiveSettingsTabId } from "../components/SettingsTabHost";
import { resolveConfigSection } from "./configTree";
import { useUniversalSettings } from "./UniversalSettingsContext";
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
    };
  });
  const visible = settings.changedOnly
    ? resolved.filter(({ knob, ladder }) => settings.editingContext === "system"
      ? JSON.stringify(knob.platform_default) !== JSON.stringify(knob.shipped_default)
      : ladder.setHere)
    : resolved;
  const groups = new Map<string, typeof resolved>();
  for (const row of visible) {
    const list = groups.get(row.ladder.group) ?? [];
    list.push(row);
    groups.set(row.ladder.group, list);
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
              showUserLockControl={
                scopeKind === "organization" && canManageOrganization
              }
              hideKey={hideKey}
              onChanged={settings.refresh}
            />
          ))}
        </SettingsSection>
      ))}
    </>
  );
}

/** The organization the values belong to, when the person has several. */
export function OrganizationRungSection() {
  const { organizations, organizationId, selectOrganization } = useUniversalSettings();
  return (
    <SettingsSection title="Looking at" icon={Building2}>
      <SettingsSelect
        label="Organization"
        description={organizations.length <= 1
          ? "Personal and organization values are always qualified to this organization."
          : "Personal and organization values are qualified to the organization you pick."}
        value={organizationId ?? ""}
        options={organizations.map((org) => ({ value: org.id, label: org.name }))}
        onValueChange={selectOrganization}
        last
      />
    </SettingsSection>
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
    <SettingsSection title="Editing" icon={editingContext === "system" ? ShieldCheck : UserRound}>
      <SettingsSegmented
        label="Settings level"
        description={editingContext === "system"
          ? "Platform defaults apply wherever a lower level has not set a value."
          : editingContext === "organization"
            ? `Organization values apply in ${organizationName ?? "the selected organization"} unless a person sets their own.`
            : `Personal values apply only to you in ${organizationName ?? "the selected organization"}.`}
        value={editingContext}
        options={options}
        onValueChange={(value) => selectEditingContext(value as "user" | "organization" | "system")}
      />
      <SettingsSwitch
        label="Changed only"
        description={editingContext === "system"
          ? "Show only platform values that differ from their registered default."
          : "Show only settings with an override saved at this level."}
        checked={changedOnly}
        onCheckedChange={setChangedOnly}
        last
      />
    </SettingsSection>
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
        `batch.deadline` currently reads platform values directly, so its lower-level overrides are not honored. Table pagination and commerce labels do use the shared resolver. The model, voice, and confirmation keys shown on the first screen have no verified active consumer beyond that screen; this is an incomplete census, not a claim that clients do not use them.
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
          {settings.error}
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
      {settings.editingContext !== "system" && <SettingsContextControls />}
      {settings.editingContext === "system" && <RegistryCoverage />}
      {settings.editingContext !== "system" && <OrganizationRungSection />}
      {settings.editingContext !== "system" && <SubOrgRungSection knobs={section.knobs} />}
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
