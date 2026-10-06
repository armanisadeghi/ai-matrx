"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { useUserOrganizations } from "../hooks";
import {
  ORGANIZATION_CAP_KNOB,
  fetchOrganizationPlanLimit,
  organizationCapVerdict,
  resolveOrganizationCap,
  type OrganizationCapVerdict,
} from "./organizationCap";

export interface OrganizationCapState extends OrganizationCapVerdict {
  /** True once the count and the cap are both known. */
  ready: boolean;
}

/**
 * The signed-in person's organization cap, from their active memberships, the
 * platform knob and the plans of the organizations they belong to. The plans
 * are only asked once the count reaches the knob default — below it nothing
 * a plan says can change the answer. `enabled: false` asks nothing and never
 * refuses (a creation surface that is not creating an organization).
 */
export function useOrganizationCap(enabled = true): OrganizationCapState {
  const userId = useAppSelector(selectUserId);
  const { organizations, loading } = useUserOrganizations("active");
  // Platform-locked knob: no organization or person rung applies.
  const knobValue = useEffectiveKnob(null, userId, ORGANIZATION_CAP_KNOB);
  const count = organizations.length;
  const base = resolveOrganizationCap(knobValue, []);
  const needsPlans = enabled && !loading && base !== null && count >= base;
  const orgKey = needsPlans ? organizations.map((org) => org.id).join(",") : "";

  const [planLimits, setPlanLimits] = useState<{ key: string; limits: (number | null)[] }>({
    key: "",
    limits: [],
  });

  useEffect(() => {
    if (!orgKey) return;
    let cancelled = false;
    void Promise.all(orgKey.split(",").map(fetchOrganizationPlanLimit)).then((limits) => {
      if (!cancelled) setPlanLimits({ key: orgKey, limits });
    });
    return () => {
      cancelled = true;
    };
  }, [orgKey]);

  const plansReady = !needsPlans || planLimits.key === orgKey;
  const cap = plansReady ? resolveOrganizationCap(knobValue, planLimits.key === orgKey ? planLimits.limits : []) : null;
  const ready = enabled && !loading && cap !== null;
  return { ...organizationCapVerdict(count, ready ? cap : null), ready };
}
