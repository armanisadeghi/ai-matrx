"use client";

// features/settings/universal/UniversalSettingsContext.tsx
//
// ONE read of the configuration registry for the whole settings surface. The
// left nav and the centre pane are different component trees, and both need
// the same answer ("which domains have settings, and what are they?"), so the
// read lives in a provider mounted once by each settings shell rather than
// fetched twice with two chances to disagree.
//
// The read is `platform.knob_index` with every rung this client can address:
// the chosen organization, the signed-in person (user rung), the sub-org rungs
// the host page is inside (`scopes`, when a page knows it is inside brand X),
// and this browser's device rung (USD-9, `lib/scoped-config/deviceId.ts`).
//
// Outside the provider the value is empty and not loading, so a tab rendered
// somewhere unexpected degrades to "no configuration here" and says so.

import { createContext, useContext, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useDefaultOrganization } from "@/features/organizations/hooks/useDefaultOrganization";
import { fetchFeatureKnobs } from "@/features/admin/limits/service";
import type { FeatureKnob } from "@/features/admin/limits/types";
import { fetchKnobIndex, type KnobScopeRef } from "@/lib/scoped-config/service";
import { getWebDeviceId } from "@/lib/scoped-config/deviceId";
import type { KnobUiHints, ScopedKnob } from "@/lib/scoped-config/types";
import { isJsonObject } from "@/types/json";
import {
  fetchTaxonomyIndex,
  resolveKnobTaxonomy,
  UNFILED_DOMAIN_NAME,
  UNFILED_DOMAIN_SLUG,
  type TaxonomyIndex,
} from "./taxonomy";
import {
  fetchScopeRows,
  isSubOrgScopeKind,
  type ScopeRow,
  type SubOrgScopeKind,
} from "./scopeRows";

/** Registry slug → settings tab id segment ("human-resources" → "humanResources"). */
export function slugToTabSegment(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Root tab id every taxonomy-driven section hangs under. */
export const CONFIG_TAB_ROOT = "config";

export type SettingsFeatureSection = {
  /** Tab id: `config.<domain>.<feature>`. */
  id: string;
  slug: string;
  name: string;
  knobs: ScopedKnob[];
};

export type SettingsDomain = {
  /** Tab id of the domain folder: `config.<domain>`. */
  id: string;
  slug: string;
  name: string;
  /** Keys filed directly under the domain (no feature node). */
  knobs: ScopedKnob[];
  features: SettingsFeatureSection[];
  /** Tab id of the leaf that renders the domain-level keys, when any. */
  domainLeafId: string | null;
};

export type UniversalSettingsValue = {
  editingContext: "user" | "organization" | "system";
  selectEditingContext: (context: "user" | "organization" | "system") => void;
  canManageSystem: boolean;
  /** Show only values explicitly set at the selected editing level. */
  changedOnly: boolean;
  setChangedOnly: (changedOnly: boolean) => void;
  organizationId: string | null;
  organizationName: string | null;
  /** The caller may write the organization rung (owner/admin). */
  canManageOrganization: boolean;
  /** People in the chosen organization — the org rung's blast radius. */
  memberCount: number | null;
  organizations: { id: string; name: string }[];
  selectOrganization: (id: string) => void;
  userId: string | null;
  /** This browser's device rung id; null when storage is unavailable. */
  deviceId: string | null;
  /**
   * The sub-organization rungs this surface is standing inside, by kind —
   * the host page's own (a brand page passes its brand) plus the ones the
   * person picked here. Passed to knob_index as p_scopes.
   */
  selectedScopes: Partial<Record<SubOrgScopeKind, string>>;
  /** Pick (or clear with null) the row for one sub-org rung. */
  selectScope: (kind: SubOrgScopeKind, id: string | null) => void;
  /** Rows available for each sub-org rung in the chosen organization. */
  scopeRows: Partial<Record<SubOrgScopeKind, ScopeRow[]>>;
  /** Sub-org rung kinds fixed by the host page (not pickable here). */
  hostScopeKinds: SubOrgScopeKind[];
  /** Every key the read returned, by full key. */
  knobs: ScopedKnob[];
  knobByKey: (fullKey: string) => ScopedKnob | null;
  /** Domains that HAVE settings, in registry name order. Never an empty shell. */
  domains: SettingsDomain[];
  isLoading: boolean;
  error: string | null;
  /** Keys the resolver could not value at all — rendered as errors, never blanks. */
  missing: ScopedKnob[];
  refresh: () => void;
};

const EMPTY: UniversalSettingsValue = {
  editingContext: "user",
  selectEditingContext: () => {},
  canManageSystem: false,
  changedOnly: false,
  setChangedOnly: () => {},
  organizationId: null,
  organizationName: null,
  canManageOrganization: false,
  memberCount: null,
  organizations: [],
  selectOrganization: () => {},
  userId: null,
  deviceId: null,
  selectedScopes: {},
  selectScope: () => {},
  scopeRows: {},
  hostScopeKinds: [],
  knobs: [],
  knobByKey: () => null,
  domains: [],
  isLoading: false,
  error: null,
  missing: [],
  refresh: () => {},
};

function systemKnob(row: FeatureKnob): ScopedKnob {
  const ui: KnobUiHints = isJsonObject(row.ui) ? row.ui : {};
  return {
    feature: row.feature, key: row.key, full_key: `${row.feature}.${row.key}`,
    label: row.label, description: row.description, value_type: row.value_type,
    unit: row.unit, allowed_values: row.allowed_values, min_value: row.min_value,
    max_value: row.max_value, basis: row.basis, set_by: row.set_by, review_due: row.review_due,
    overridable_by: row.overridable_by as ScopedKnob["overridable_by"],
    override_direction: row.override_direction, bound_value: row.bound_value,
    platform_locked: false, org_locked_kinds: [], user_override_locked: false,
    platform_default: row.value, shipped_default: row.default_value, org_override: null,
    user_override: null, effective_value: row.value, origin: "platform_default",
    origin_scope_id: null, origin_precedence: null,
    is_overridden: JSON.stringify(row.value) !== JSON.stringify(row.default_value),
    out_of_range: false, ui, taxonomy: null, propagation: row.propagation,
    // Platform is intentionally absent: it is not a knob_scope_kind.
    scope_chain: [], locked: null, write_rung: { kind: "platform", scope_id: null },
    can_write: true, can_write_reason: null, secret: null,
  };
}

const UniversalSettingsContext = createContext<UniversalSettingsValue>(EMPTY);

export function useUniversalSettings(): UniversalSettingsValue {
  return useContext(UniversalSettingsContext);
}

function groupDomains(
  knobs: ScopedKnob[],
  taxonomy: TaxonomyIndex,
  includePlatformOnly = false,
): SettingsDomain[] {
  const groups = new Map<string, SettingsDomain>();
  for (const knob of knobs) {
    // The personal surface shows what a person or organization may actually
    // steer. A key nobody below the platform may touch belongs on the admin
    // limits page; `knob_index` already filters it when no prefix is passed.
    if (!includePlatformOnly && knob.overridable_by.length === 0) continue;
    const filed = resolveKnobTaxonomy(knob, taxonomy);
    const slug = filed?.domain_slug ?? UNFILED_DOMAIN_SLUG;
    const name = filed?.domain_name ?? UNFILED_DOMAIN_NAME;
    const id = `${CONFIG_TAB_ROOT}.${slugToTabSegment(slug)}`;
    const domain = groups.get(slug) ?? {
      id,
      slug,
      name,
      knobs: [],
      features: [],
      domainLeafId: null,
    };
    if (filed?.feature_slug) {
      let feature = domain.features.find((f) => f.slug === filed.feature_slug);
      if (!feature) {
        feature = {
          id: `${id}.${slugToTabSegment(filed.feature_slug)}`,
          slug: filed.feature_slug,
          name: filed.feature_name ?? filed.feature_slug,
          knobs: [],
        };
        domain.features.push(feature);
      }
      feature.knobs.push(knob);
    } else {
      domain.knobs.push(knob);
      domain.domainLeafId = `${id}.${slugToTabSegment(slug)}`;
    }
    groups.set(slug, domain);
  }
  // Taxonomy is navigation, not an accidental by-product of existing knobs:
  // registered empty domains remain visible and truthfully say what is missing.
  for (const node of taxonomy.byId.values()) {
    if (node.level !== "domain" || groups.has(node.slug)) continue;
    groups.set(node.slug, {
      id: `${CONFIG_TAB_ROOT}.${slugToTabSegment(node.slug)}`,
      slug: node.slug,
      name: node.name,
      knobs: [],
      features: [],
      domainLeafId: `${CONFIG_TAB_ROOT}.${slugToTabSegment(node.slug)}.${slugToTabSegment(node.slug)}`,
    });
  }
  for (const domain of groups.values()) {
    domain.features.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) => {
    // "Not filed yet" is real, and it sorts last so it never leads the nav.
    if (a.slug === UNFILED_DOMAIN_SLUG) return 1;
    if (b.slug === UNFILED_DOMAIN_SLUG) return -1;
    return a.name.localeCompare(b.name);
  });
}

export function UniversalSettingsProvider({
  children,
  scopes,
}: {
  children: React.ReactNode;
  /**
   * Sub-organization rungs the host page is inside (brand, site, …). The
   * settings route itself is inside none; a brand's own settings page passes
   * its brand here and the same provider answers for that rung.
   */
  scopes?: KnobScopeRef[];
}) {
  const userId = useAppSelector(selectUserId);
  const canManageSystem = useAppSelector(selectIsSuperAdmin);
  const { organizations } = useUserOrganizations();
  const { defaultOrganizationId } = useDefaultOrganization();
  const [chosenOrgId, setChosenOrgId] = useState<string | null>(null);
  const [editingContext, selectEditingContext] = useState<"user" | "organization" | "system">("user");
  const [changedOnly, setChangedOnly] = useState(false);
  const organizationId =
    chosenOrgId ??
    organizations.find((org) => org.id === defaultOrganizationId)?.id ??
    organizations[0]?.id ??
    null;
  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    setDeviceId(getWebDeviceId());
  }, []);

  const [generation, setGeneration] = useState(0);
  const refresh = () => setGeneration((n) => n + 1);

  // Sub-org rungs: the host page's own, then whatever the person picks here.
  const [picked, setPicked] = useState<{
    organizationId: string | null;
    scopes: Partial<Record<SubOrgScopeKind, string>>;
  }>({ organizationId: null, scopes: {} });
  const pickedForOrg = picked.organizationId === organizationId ? picked.scopes : {};
  const hostScopes: Partial<Record<SubOrgScopeKind, string>> = {};
  for (const ref of scopes ?? []) {
    if (isSubOrgScopeKind(ref.kind)) hostScopes[ref.kind] = ref.id;
  }
  const selectedScopes: Partial<Record<SubOrgScopeKind, string>> = {
    ...pickedForOrg,
    ...hostScopes,
  };
  const selectScope = (kind: SubOrgScopeKind, id: string | null) =>
    setPicked((prev) => {
      const base = prev.organizationId === organizationId ? prev.scopes : {};
      const next = { ...base };
      if (id) next[kind] = id;
      else delete next[kind];
      return { organizationId, scopes: next };
    });
  const effectiveScopes: KnobScopeRef[] = (
    Object.entries(selectedScopes) as [SubOrgScopeKind, string][]
  ).map(([kind, id]) => ({ kind, id }));

  const scopesKey = JSON.stringify(effectiveScopes.length > 0 ? effectiveScopes : null);
  const requestKey = `${organizationId ?? ""}|${userId ?? ""}|${deviceId ?? ""}|${scopesKey}`;

  const [state, setState] = useState<{
    requestKey: string;
    knobs: ScopedKnob[];
    taxonomy: TaxonomyIndex;
    error: string | null;
  } | null>(null);
  const [systemRows, setSystemRows] = useState<{
    generation: number;
    rows: ScopedKnob[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!organizationId || !userId) return;
    let cancelled = false;
    const parsedScopes = JSON.parse(scopesKey) as KnobScopeRef[] | null;
    void Promise.all([
      fetchKnobIndex({
        organizationId,
        userId,
        deviceId: deviceId ?? undefined,
        scopes: parsedScopes ?? undefined,
      }),
      fetchTaxonomyIndex(),
    ])
      .then(([knobs, taxonomy]) => {
        if (cancelled) return;
        setState({ requestKey, knobs, taxonomy, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          requestKey,
          knobs: [],
          taxonomy: { byId: new Map(), bySlug: new Map() },
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, userId, deviceId, scopesKey, requestKey, generation]);

  useEffect(() => {
    if (editingContext !== "system" || !canManageSystem) return;
    let cancelled = false;
    void fetchFeatureKnobs()
      .then((rows) => {
        if (!cancelled) setSystemRows({ generation, rows: rows.map(systemKnob), error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSystemRows({ generation, rows: [], error: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [editingContext, canManageSystem, generation]);

  // Mask a previous organization's configuration synchronously: a stale answer
  // on screen is a lie about whose policy you are looking at.
  const current = state?.requestKey === requestKey ? state : null;
  const system = systemRows?.generation === generation ? systemRows : null;
  const knobs = editingContext === "system" ? (system?.rows ?? []) : (current?.knobs ?? []);

  // The rows a person may stand inside, for every sub-org rung some key names.
  const neededKinds = [
    ...new Set(
      knobs.flatMap((knob) => knob.overridable_by).filter(isSubOrgScopeKind),
    ),
  ].sort();
  const neededKey = `${organizationId ?? ""}|${neededKinds.join(",")}`;
  const [rowsState, setRowsState] = useState<{
    key: string;
    rows: Partial<Record<SubOrgScopeKind, ScopeRow[]>>;
  } | null>(null);
  useEffect(() => {
    if (!organizationId || neededKinds.length === 0) return;
    let cancelled = false;
    const kinds = neededKey.split("|")[1]!.split(",").filter(Boolean) as SubOrgScopeKind[];
    void Promise.all(
      kinds.map((kind) =>
        fetchScopeRows(kind, organizationId).then(
          (rows) => [kind, rows] as const,
          // A rung whose rows cannot be read is still shown — with the reason.
          (err: unknown) =>
            [kind, [{ id: "__unlistable__", label: `Could not list: ${err instanceof Error ? err.message : String(err)}` }]] as const,
        ),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setRowsState({ key: neededKey, rows: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, neededKey, neededKinds.length]);
  const scopeRows = rowsState?.key === neededKey ? rowsState.rows : {};
  const taxonomy = current?.taxonomy ?? { byId: new Map(), bySlug: new Map() };
  const domains = groupDomains(knobs, taxonomy, editingContext === "system");
  const byKey = new Map(knobs.map((knob) => [knob.full_key, knob]));

  const value: UniversalSettingsValue = {
    editingContext,
    selectEditingContext: (context) => {
      if (context !== "system" || canManageSystem) selectEditingContext(context);
    },
    canManageSystem,
    changedOnly,
    setChangedOnly,
    organizationId,
    organizationName: organization?.name ?? null,
    canManageOrganization:
      organization?.role === "owner" || organization?.role === "admin",
    memberCount: organization?.memberCount ?? null,
    organizations: organizations.map((org) => ({ id: org.id, name: org.name })),
    selectOrganization: setChosenOrgId,
    userId: userId ?? null,
    deviceId,
    selectedScopes,
    selectScope,
    scopeRows,
    hostScopeKinds: Object.keys(hostScopes) as SubOrgScopeKind[],
    knobs,
    knobByKey: (fullKey) => byKey.get(fullKey) ?? null,
    domains,
    isLoading: editingContext === "system"
      ? canManageSystem && !system
      : Boolean(organizationId && userId) && !current,
    error: editingContext === "system" ? system?.error ?? null : current?.error ?? null,
    missing: knobs.filter((knob) => knob.origin === "missing"),
    refresh,
  };

  return (
    <UniversalSettingsContext.Provider value={value}>
      {children}
    </UniversalSettingsContext.Provider>
  );
}
