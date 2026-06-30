// features/scopes/components/associations/PrimaryEntityContext.tsx
//
// The page-context bridge for association cards. A page that owns a container
// entity (an org page, a scope page, a project page) wraps its content once:
//
//   <PrimaryEntityProvider value={{ type: "organization", id: orgId, orgId }}>
//     <AssociationCard token="task" />
//     <AssociationCard token="file" />
//   </PrimaryEntityProvider>
//
// and every <AssociationCard> inside resolves its primary entity automatically —
// no prop drilling. A card may still override with an explicit `container` prop.

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AssociationTargetType } from "@/features/scopes/types";

/** The primary (container) entity a surface is anchored to. */
export interface PrimaryEntity {
  /** Container token — must be an association TARGET type. */
  type: AssociationTargetType;
  id: string;
  /** Org to stamp on edges created here (org-scoped RLS / counts). */
  orgId?: string | null;
  /** Human label for headings (e.g. the org/scope name). */
  label?: string;
}

const PrimaryEntityCtx = createContext<PrimaryEntity | null>(null);

export function PrimaryEntityProvider({
  value,
  children,
}: {
  value: PrimaryEntity;
  children: ReactNode;
}) {
  return (
    <PrimaryEntityCtx.Provider value={value}>
      {children}
    </PrimaryEntityCtx.Provider>
  );
}

/** Read the surrounding primary entity, or null when unprovided. */
export function usePrimaryEntity(): PrimaryEntity | null {
  return useContext(PrimaryEntityCtx);
}
