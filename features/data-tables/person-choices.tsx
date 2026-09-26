"use client";

/**
 * person-choices — the options of a `person` column: the members of the
 * organization the TABLE belongs to, as choice options (value = user id,
 * label = the name people know them by).
 *
 * Provided once at the grid's root and read wherever a person cell is edited
 * (the grid cell and the row forms both go through `ChoiceInput`), so the
 * lib-level choice system never learns about organizations or members — it
 * receives options, the way it does for a structured list.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useOrgMembers } from "@/features/crm/deals/useOrgMembers";
import type { FieldChoice } from "@ai-matrx/design-system/field-formats";
import { resolveUserName } from "@/components/user/UserIdentity";

const PersonChoicesContext = createContext<FieldChoice[] | undefined>(undefined);

/** Members of `organizationId` as choice options; `undefined` while loading or without an organization. */
export function usePersonChoicesFor(organizationId: string | null | undefined): FieldChoice[] | undefined {
  const { memberById, isLoading } = useOrgMembers(organizationId ? [organizationId] : []);
  return useMemo(() => {
    if (!organizationId || isLoading) return undefined;
    const out: FieldChoice[] = [];
    for (const [id, user] of memberById) {
      out.push({ value: id, label: resolveUserName(user) || user.email || id });
    }
    out.sort((a, b) => (a.label ?? a.value).localeCompare(b.label ?? b.value));
    return out;
  }, [organizationId, isLoading, memberById]);
}

export function PersonChoicesProvider({
  organizationId,
  children,
}: {
  organizationId: string | null | undefined;
  children: ReactNode;
}) {
  const choices = usePersonChoicesFor(organizationId);
  return <PersonChoicesContext.Provider value={choices}>{children}</PersonChoicesContext.Provider>;
}

/** The provided member options, or `undefined` when no provider is above (or still loading). */
export function usePersonChoices(): FieldChoice[] | undefined {
  return useContext(PersonChoicesContext);
}
