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

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectIsSuperAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { fetchFeatureKnobs } from "@/features/admin/limits/service";
import type { FeatureKnob } from "@/features/admin/limits/types";
import { fetchKnobIndex, type KnobScopeRef } from "@/lib/scoped-config/service";
import { getWebDeviceId } from "@/lib/scoped-config/deviceId";
import type { KnobUiHints, ScopedKnob } from "@/lib/scoped-config/types";
import { isJsonObject } from "@/types/json";
import { extractErrorMessage } from "@/utils/errors";
import {
  fetchTaxonomyIndex,
  resolveKnobTaxonomy,
  taxonomyForNodeId,
  UNFILED_DOMAIN_NAME,
  UNFILED_DOMAIN_SLUG,
  type TaxonomyIndex,
} from "./taxonomy";

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

/** A destination never renders a control it cannot write at that rung. */
export function filterKnobsForTarget(
  knobs: ScopedKnob[],
  target: "user" | "organization" | "system",
): ScopedKnob[] {
  return knobs.filter((knob) =>
    target === "system" || knob.overridable_by.includes(target),
  );
}

export function resolverRequestForTarget({
  target, organizationId, userId, deviceId, scopes,
}: {
  target: "user" | "organization";
  organizationId: string | null | undefined;
  userId: string;
  deviceId: string | null;
  scopes?: KnobScopeRef[];
}) {
  return {
    organizationId: organizationId!,
    userId: target === "user" ? userId : undefined,
    deviceId: target === "user" ? deviceId ?? undefined : undefined,
    scopes,
  };
}

export type UniversalSettingsValue = {
  editingContext: "user" | "organization" | "system";
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
  userId: string | null;
  /** This browser's device rung id; null when storage is unavailable. */
  deviceId: string | null;
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
  canManageSystem: false,
  changedOnly: false,
  setChangedOnly: () => {},
  organizationId: null,
  organizationName: null,
  canManageOrganization: false,
  memberCount: null,
  organizations: [],
  userId: null,
  deviceId: null,
  knobs: [],
  knobByKey: () => null,
  domains: [],
  isLoading: false,
  error: null,
  missing: [],
  refresh: () => {},
};

export function systemKnob(
  row: FeatureKnob,
  taxonomy: TaxonomyIndex,
): ScopedKnob {
  const ui: KnobUiHints = isJsonObject(row.ui) ? row.ui : {};
  const valueType = row.value_type as ScopedKnob["value_type"];
  const isSecret = valueType === "secret";
  return {
    feature: row.feature, key: row.key, full_key: `${row.feature}.${row.key}`,
    label: row.label, description: row.description, value_type: valueType,
    unit: row.unit, allowed_values: row.allowed_values, min_value: row.min_value,
    max_value: row.max_value, basis: row.basis, set_by: row.set_by, review_due: row.review_due,
    overridable_by: row.overridable_by as ScopedKnob["overridable_by"],
    override_direction: row.override_direction, bound_value: row.bound_value,
    platform_locked: false, org_locked_kinds: [], user_override_locked: false,
    platform_default: isSecret ? null : row.value,
    shipped_default: isSecret ? null : row.default_value,
    org_override: null, user_override: null,
    effective_value: isSecret ? null : row.value, origin: "platform_default",
    origin_scope_id: null, origin_precedence: null,
    is_overridden: !isSecret && JSON.stringify(row.value) !== JSON.stringify(row.default_value),
    out_of_range: false, ui,
    taxonomy: taxonomyForNodeId(row.taxonomy_node_id, taxonomy),
    propagation: row.propagation,
    // Platform is intentionally absent: it is not a knob_scope_kind.
    scope_chain: [], locked: null, write_rung: { kind: "platform", scope_id: null },
    can_write: true, can_write_reason: null,
    // feature_knob deliberately holds no vault state. Do not manufacture a
    // “Not set” answer (or expose a raw secret) for the system register.
    secret: isSecret ? { state: "unknown", vault_key: null } : null,
  };
}

const UniversalSettingsContext = createContext<UniversalSettingsValue>(EMPTY);

export function useUniversalSettings(): UniversalSettingsValue {
  return useContext(UniversalSettingsContext);
}

export function groupDomains(
  knobs: ScopedKnob[],
  taxonomy: TaxonomyIndex,
  includePlatformOnly = false,
): SettingsDomain[] {
  const groups = new Map<string, SettingsDomain>();
  // Start with the full canonical taxonomy. A setting registry is incomplete
  // product coverage, not permission to erase a domain or feature from nav.
  for (const node of taxonomy.byId.values()) {
    if (node.level !== "domain") continue;
    groups.set(node.slug, {
      id: `${CONFIG_TAB_ROOT}.${slugToTabSegment(node.slug)}`,
      slug: node.slug,
      name: node.name,
      knobs: [],
      features: [],
      // This existing id is retained for direct links and now acts as the
      // domain overview, whether or not it currently has domain-level knobs.
      domainLeafId: `${CONFIG_TAB_ROOT}.${slugToTabSegment(node.slug)}.${slugToTabSegment(node.slug)}`,
    });
  }
  for (const node of taxonomy.byId.values()) {
    if (node.level !== "feature") continue;
    const filed = taxonomyForNodeId(node.id, taxonomy);
    if (!filed?.domain_slug) continue;
    const domain = groups.get(filed.domain_slug);
    if (!domain || domain.features.some((feature) => feature.slug === node.slug)) continue;
    domain.features.push({
      id: `${domain.id}.${slugToTabSegment(node.slug)}`,
      slug: node.slug,
      name: node.name,
      knobs: [],
    });
  }
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
      domainLeafId: `${id}.${slugToTabSegment(slug)}`,
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
  target = "user",
  organizationId: fixedOrganizationId,
  canManageOrganization: fixedCanManageOrganization,
  organizationName: fixedOrganizationName,
  memberCount: fixedMemberCount,
}: {
  children: React.ReactNode;
  /**
   * Inherited sub-organization rungs supplied by a host (brand, site, …).
   * They are read context only; this provider never creates a scope picker.
   */
  scopes?: KnobScopeRef[];
  /** A host owns its destination; settings never select an acting-as context. */
  target?: "user" | "organization" | "system";
  organizationId?: string;
  /** Route-derived authorization for an immutable organization destination. */
  canManageOrganization?: boolean;
  organizationName?: string | null;
  memberCount?: number | null;
}) {
  const userId = useAppSelector(selectUserId);
  const canManageSystem = useAppSelector(selectIsSuperAdmin);
  const { organizations } = useUserOrganizations();
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const editingContext = target;
  const [changedOnly, setChangedOnly] = useState(false);
  const organizationId = target === "organization"
    ? fixedOrganizationId ?? null
    : activeOrganizationId;
  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    setDeviceId(getWebDeviceId());
  }, []);

  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  // A host may supply inherited scope/device read context. This surface never
  // fabricates scope choices or probes picker rows: its destination is fixed.
  const scopesKey = JSON.stringify(scopes ?? null);
  // Each target has a distinct resolver contract. An organization page must
  // never send a personal or device rung that could change the write target.
  const resolverUserId = target === "user" ? userId ?? undefined : undefined;
  const resolverDeviceId = target === "user" ? deviceId ?? undefined : undefined;
  // Auth identity is always part of the key, including org/system reads where
  // the RPC must not receive a personal rung but must still mask old results.
  const requestKey = `${target}|${organizationId ?? ""}|auth:${userId ?? ""}|rung:${resolverUserId ?? ""}|${resolverDeviceId ?? ""}|${scopesKey}`;

  const [state, setState] = useState<{
    requestKey: string;
    knobs: ScopedKnob[];
    taxonomy: TaxonomyIndex;
    error: string | null;
  } | null>(null);
  // Navigation must not disappear while a different editing context is
  // loading. This independent complete read supplies the canonical empty
  // domains/features until the context-specific registry answer arrives.
  const [taxonomyState, setTaxonomyState] = useState<{
    requestKey: string;
    taxonomy: TaxonomyIndex;
    error: string | null;
  } | null>(null);
  const [systemRows, setSystemRows] = useState<{
    requestKey: string;
    rows: ScopedKnob[];
    taxonomy: TaxonomyIndex;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const taxonomyRequestKey = `${requestKey}|${generation}`;
    void fetchTaxonomyIndex()
      .then((taxonomy) => {
        if (!cancelled) setTaxonomyState({ requestKey: taxonomyRequestKey, taxonomy, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTaxonomyState({
            requestKey: taxonomyRequestKey,
            taxonomy: { byId: new Map(), bySlug: new Map() },
            error: extractErrorMessage(err),
          });
        }
      });
    return () => { cancelled = true; };
  }, [requestKey, generation]);

  useEffect(() => {
    if (editingContext === "system" || !organizationId || !userId) return;
    let cancelled = false;
    const parsedScopes = JSON.parse(scopesKey) as KnobScopeRef[] | null;
    void Promise.all([
      fetchKnobIndex(resolverRequestForTarget({
        target: editingContext,
        organizationId,
        userId,
        deviceId: resolverDeviceId ?? null,
        scopes: parsedScopes ?? undefined,
      })),
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
          error: extractErrorMessage(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, resolverUserId, resolverDeviceId, scopesKey, requestKey, generation]);

  useEffect(() => {
    if (editingContext !== "system" || !canManageSystem) return;
    let cancelled = false;
    const systemRequestKey = `${requestKey}|${canManageSystem}|${generation}`;
    void Promise.all([fetchFeatureKnobs(), fetchTaxonomyIndex()])
      .then(([rows, taxonomy]) => {
        if (!cancelled) setSystemRows({ requestKey: systemRequestKey, rows: rows.map((row) => systemKnob(row, taxonomy)), taxonomy, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSystemRows({
          requestKey: systemRequestKey,
          rows: [],
          taxonomy: { byId: new Map(), bySlug: new Map() },
          error: extractErrorMessage(err),
        });
      });
    return () => { cancelled = true; };
  }, [editingContext, canManageSystem, requestKey, generation]);

  // Mask a previous organization's configuration synchronously: a stale answer
  // on screen is a lie about whose policy you are looking at.
  const current = state?.requestKey === requestKey ? state : null;
  const system = systemRows?.requestKey === `${requestKey}|${canManageSystem}|${generation}` ? systemRows : null;
  const knobs = editingContext === "system" ? (system?.rows ?? []) : (current?.knobs ?? []);

  const taxonomyStateForRequest = taxonomyState?.requestKey === `${requestKey}|${generation}` ? taxonomyState : null;
  const taxonomy = system?.taxonomy ?? current?.taxonomy ?? taxonomyStateForRequest?.taxonomy ?? {
    byId: new Map(),
    bySlug: new Map(),
  };
  // A fixed destination only sees keys it can write at that destination.
  // In particular, user settings never expose an organization-only key that
  // could otherwise be retargeted by a stale draft.
  const destinationKnobs = filterKnobsForTarget(knobs, editingContext);
  const domains = groupDomains(destinationKnobs, taxonomy, editingContext === "system");
  const byKey = new Map(destinationKnobs.map((knob) => [knob.full_key, knob]));

  const value: UniversalSettingsValue = {
    editingContext,
    canManageSystem,
    changedOnly,
    setChangedOnly,
    organizationId,
    organizationName: fixedOrganizationName ?? organization?.name ?? null,
    canManageOrganization: target === "organization"
      ? fixedCanManageOrganization ?? false
      : organization?.role === "owner" || organization?.role === "admin",
    memberCount: fixedMemberCount ?? organization?.memberCount ?? null,
    organizations: organizations.map((org) => ({ id: org.id, name: org.name })),
    userId: userId ?? null,
    deviceId,
    knobs: destinationKnobs,
    knobByKey: (fullKey) => byKey.get(fullKey) ?? null,
    domains,
    isLoading: editingContext === "system"
      ? canManageSystem && !system
      : Boolean(organizationId && userId) && !current,
    error: editingContext === "system" ? system?.error ?? null : current?.error ?? taxonomyStateForRequest?.error ?? null,
    missing: destinationKnobs.filter((knob) => knob.origin === "missing"),
    refresh,
  };

  return (
    <UniversalSettingsContext.Provider value={value}>
      {children}
    </UniversalSettingsContext.Provider>
  );
}
