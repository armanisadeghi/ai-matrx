"use client";

/**
 * THE LAZY DIAGNOSIS behind the kind fix-it bar (Arman, 2026-08-27):
 * "if the kind is inactive or the component is inactive or there's any silly
 * setting-related thing stopping something from doing what it should, we show
 * an action bar that lets the user do something about it … you just have to
 * make sure that check is only done when things don't directly go through, so
 * we're not wasting resources doing checks on every single render."
 *
 * So: this NEVER runs on a successful custom render. It runs only when a
 * settled value already fell back to the generic viewer, once per kind per
 * session (cached promise), and answers: WHY is this not rendering as itself,
 * and what one click would fix it?
 */

import { createClient } from "@/utils/supabase/client";

export type KindRenderGapState =
  /** No kind_definition row exists for this slug at all. */
  | "unregistered"
  /** Kind exists but no output component row of any sort. */
  | "no_component"
  /** The only real component row(s) are switched off (the kill switch). */
  | "component_inactive"
  /** A db-source component row exists but its code body is empty. */
  | "component_empty"
  /** Components fine (or generic by choice) — the kind itself is inactive. */
  | "kind_inactive"
  /** Nothing actionable — generic is simply the current truth. */
  | "generic_is_truth";

export interface KindRenderGapDiagnosis {
  state: KindRenderGapState;
  kind: string;
  kindDefinitionId: string | null;
  kindLabel: string | null;
  kindActive: boolean;
  kindCreatedBy: string | null;
  kindOrganizationId: string | null;
  hasCanonicalExample: boolean;
  emittedJsonSchema: unknown;
  /** The inactive component row a re-activate action would flip. */
  inactiveComponentId: string | null;
  inactiveComponentKey: string | null;
  inactiveComponentCreatedBy: string | null;
}

/** Session cache — one diagnosis per kind, invalidated after any fix action. */
const cache = new Map<string, Promise<KindRenderGapDiagnosis | null>>();

export function invalidateKindRenderGap(kind: string): void {
  cache.delete(kind);
}

export function diagnoseKindRenderGap(
  kind: string,
): Promise<KindRenderGapDiagnosis | null> {
  const cached = cache.get(kind);
  if (cached) return cached;
  const promise = compute(kind).catch((error) => {
    // A failed diagnosis must not stick — the next fallback render may retry.
    cache.delete(kind);
    console.error(`[kind-fixit] diagnosis failed for "${kind}":`, error);
    return null;
  });
  cache.set(kind, promise);
  return promise;
}

async function compute(kind: string): Promise<KindRenderGapDiagnosis | null> {
  const supabase = createClient();

  const { data: def, error: defError } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select(
      "id, label, is_active, created_by, organization_id, emitted_json_schema",
    )
    .eq("kind", kind)
    .is("deleted_at", null)
    .maybeSingle();
  if (defError) throw defError;

  if (!def) {
    return {
      state: "unregistered",
      kind,
      kindDefinitionId: null,
      kindLabel: null,
      kindActive: false,
      kindCreatedBy: null,
      kindOrganizationId: null,
      hasCanonicalExample: false,
      emittedJsonSchema: null,
      inactiveComponentId: null,
      inactiveComponentKey: null,
      inactiveComponentCreatedBy: null,
    };
  }

  const [componentsResult, exampleResult] = await Promise.all([
    supabase
      .schema("content_ir")
      .from("kind_component")
      .select("id, component_key, source, component_source, is_active, created_by")
      .eq("kind_definition_id", def.id)
      .eq("role", "output")
      .eq("platform", "web")
      .is("deleted_at", null),
    supabase
      .schema("content_ir")
      .from("kind_example")
      .select("id")
      .eq("kind_definition_id", def.id)
      .eq("is_canonical", true)
      .is("deleted_at", null)
      .limit(1),
  ]);
  if (componentsResult.error) throw componentsResult.error;
  if (exampleResult.error) throw exampleResult.error;

  const rows = componentsResult.data ?? [];
  // "Real" = anything beyond the generic fallback registration.
  const real = rows.filter((r) => r.component_key !== "generic_structured");
  const activeReal = real.filter((r) => r.is_active);
  const emptyDb = activeReal.find(
    (r) =>
      r.source === "db" &&
      (!r.component_source || r.component_source.trim().length < 50),
  );
  const inactiveReal = real.find((r) => !r.is_active);

  const base = {
    kind,
    kindDefinitionId: def.id as string,
    kindLabel: (def.label as string) ?? null,
    kindActive: def.is_active === true,
    kindCreatedBy: (def.created_by as string) ?? null,
    kindOrganizationId: (def.organization_id as string) ?? null,
    hasCanonicalExample: (exampleResult.data ?? []).length > 0,
    emittedJsonSchema: def.emitted_json_schema as unknown,
    inactiveComponentId: null as string | null,
    inactiveComponentKey: null as string | null,
    inactiveComponentCreatedBy: null as string | null,
  };

  if (real.length === 0) {
    return { ...base, state: "no_component" };
  }
  if (activeReal.length === 0 && inactiveReal) {
    return {
      ...base,
      state: "component_inactive",
      inactiveComponentId: inactiveReal.id as string,
      inactiveComponentKey: inactiveReal.component_key as string,
      inactiveComponentCreatedBy: (inactiveReal.created_by as string) ?? null,
    };
  }
  if (emptyDb) {
    return { ...base, state: "component_empty" };
  }
  if (!base.kindActive) {
    // Active component exists yet we still fell back — with rendering no
    // longer gated on kind activation this is rare (a resolver miss, a race);
    // activation is still the one USE-side action worth offering.
    return { ...base, state: "kind_inactive" };
  }
  // An active real component exists and the kind is active, yet the caller
  // rendered generic — transient (fetch race) or deliberate. Nothing to fix.
  return { ...base, state: "generic_is_truth" };
}
