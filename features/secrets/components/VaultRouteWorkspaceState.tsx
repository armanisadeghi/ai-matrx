"use client";

import { createContext, useContext, useState } from "react";
import type { VaultListSort } from "../vault-list";
import type { CredentialFamily, VaultScope } from "../types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

interface VaultRouteWorkspaceState {
  search: string;
  setSearch: (value: string) => void;
  sort: VaultListSort;
  setSort: (value: VaultListSort) => void;
  family: "all" | CredentialFamily;
  setFamily: (value: "all" | CredentialFamily) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (value: boolean | ((current: boolean) => boolean)) => void;
  scope: VaultScope;
  setScope: (value: VaultScope) => void;
}

const VaultRouteWorkspaceStateContext = createContext<VaultRouteWorkspaceState | null>(null);

/** Keeps route-local list controls in memory while `/vault/[itemId]` swaps pages. */
export function VaultRouteWorkspaceStateProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<VaultListSort>("newest");
  const [family, setFamily] = useState<"all" | CredentialFamily>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [scope, setScope] = useState<VaultScope>({ kind: "mine" });
  return <VaultRouteWorkspaceStateContext value={{ search, setSearch, sort, setSort, family, setFamily, favoritesOnly, setFavoritesOnly, scope, setScope }}>
    {children}
  </VaultRouteWorkspaceStateContext>;
}

/** Route navigation keeps this boundary mounted; identity/context changes remount its in-memory view state. */
export function VaultRouteWorkspaceStateBoundary({ children }: { children: React.ReactNode }) {
  const actorId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  return <VaultRouteWorkspaceStateProvider key={`${actorId ?? ""}\u0000${organizationId ?? ""}`}>
    {children}
  </VaultRouteWorkspaceStateProvider>;
}

export function useVaultRouteWorkspaceState() {
  return useContext(VaultRouteWorkspaceStateContext);
}
