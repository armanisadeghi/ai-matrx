"use client";

// The viewer `connection-ownership.ts` judges every connected account against:
// who is signed in, and — once the organization tree has answered — which
// organizations they belong to. Everyone belongs to at least one organization,
// so an empty list means the tree has not answered yet.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import type { ConnectionViewer } from "./connection-ownership";

export function useConnectionViewer(): ConnectionViewer {
  const userId = useAppSelector(selectUserId);
  const organizations = useAppSelector(selectOrganizationsList);
  return {
    userId: userId ?? null,
    organizationIds:
      organizations && organizations.length > 0
        ? new Set(organizations.map((org) => org.id))
        : null,
  };
}
