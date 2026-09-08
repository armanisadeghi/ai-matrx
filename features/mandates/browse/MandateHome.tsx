"use client";

// features/mandates/browse/MandateHome.tsx
//
// WHOSE JOB IS THIS? — the HOME cell, on every mandate row.
//
// 🚨 WHY IT EXISTS (one-resolution FIX-R3/W1, 2026-09-08). A mandate's home is
// its ORGANIZATION (DESIGN-one-resolution.md D-R3), and a personal workspace is
// just an organization. `/mandates` blends the platform's own jobs with every
// organization the caller belongs to — 400+ platform jobs beside a handful an
// organization added — and until now nothing on a row said which was which. A
// walker reading the list could not tell the job the platform ships from the
// job their own team added, which is the whole distinction the one-resolution
// ruling is about.
//
// The id comes from the door (`mnd_list_scoped.home_organization_id`); only the
// NAME is resolved here, from the organizations the caller belongs to plus the
// platform's own. Nothing is derived, filtered or decided from this — it is a
// display resolution of an identifier, exactly like `applies_in`'s.
//
// AN UNKNOWN HOME IS SAID, NOT GUESSED. The door only ever returns the system
// org or an organization the caller belongs to, so an id this map cannot
// resolve means the corpus and the membership list disagree — it renders as
// itself with a loud console error, the same rule `layerMeta` follows one file
// over. It is never quietly relabelled "Unknown" or blanked.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { useUserOrganizations } from "@/features/organizations/hooks";

/** The platform's own home, as a person reads it. */
export const SYSTEM_HOME_NAME = "Matrx System";

export interface MandateHomeNames {
  /** organization id (lower-case) → the name a person reads. */
  byId: Readonly<Record<string, string>>;
  /** True until the membership list has answered — a name is not "missing" yet. */
  loading: boolean;
}

const HomeNamesContext = createContext<MandateHomeNames | null>(null);

/**
 * Self-sufficient on purpose: it reads the same membership list the ownership
 * tabs read, so a host mounts it with no props and cannot hand it a stale or
 * partial map. (The tab COUNTS still come from the door — see
 * `browse/service.ts`; this map carries names only.)
 */
export function MandateHomeNamesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { organizations, loading } = useUserOrganizations();
  const value = useMemo<MandateHomeNames>(() => {
    const byId: Record<string, string> = {
      [SYSTEM_ORGANIZATION_ID.toLowerCase()]: SYSTEM_HOME_NAME,
    };
    for (const organization of organizations) {
      byId[organization.id.toLowerCase()] = organization.name;
    }
    return { byId, loading };
  }, [organizations, loading]);
  return (
    <HomeNamesContext.Provider value={value}>
      {children}
    </HomeNamesContext.Provider>
  );
}

export function useMandateHomeNames(): MandateHomeNames {
  return useContext(HomeNamesContext) ?? { byId: {}, loading: true };
}

/**
 * The home of one row, in words — or `null` when there is honestly nothing to
 * say yet (the names are still being read, or the door returned no home).
 */
export function useMandateHomeLabel(
  homeOrganizationId: string | null,
): { name: string; isSystem: boolean } | null {
  const { byId, loading } = useMandateHomeNames();
  if (!homeOrganizationId) return null;
  const id = homeOrganizationId.toLowerCase();
  const isSystem = id === SYSTEM_ORGANIZATION_ID.toLowerCase();
  const name = byId[id];
  if (name) return { name, isSystem };
  if (loading) return null;
  console.error(
    `[mandates] the list door returned a mandate homed in ${homeOrganizationId}, which is neither the Matrx System organization nor one this person belongs to — showing the id verbatim. See features/mandates/browse/MandateHome.tsx.`,
  );
  return { name: homeOrganizationId, isSystem: false };
}

const SYSTEM_CLASS = "border-border/70 text-muted-foreground";
const ORG_CLASS =
  "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400";

/**
 * The badge itself. Silent while the names are still being read — a blank cell
 * that fills in is honest; "Unknown" for two seconds is not.
 */
export function MandateHomeBadge({
  homeOrganizationId,
  className,
}: {
  homeOrganizationId: string | null;
  className?: string;
}) {
  const home = useMandateHomeLabel(homeOrganizationId);
  if (!home) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-full truncate py-0 text-[10px]",
        home.isSystem ? SYSTEM_CLASS : ORG_CLASS,
        className,
      )}
      title={
        home.isSystem
          ? "The platform ships this job. Every organization on AI Matrx inherits it."
          : `${home.name} added this job, so it exists for that organization only.`
      }
    >
      {home.name}
    </Badge>
  );
}
