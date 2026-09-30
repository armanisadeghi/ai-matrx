"use client";

import { createContext, useContext, useState } from "react";
import type { VaultListSort } from "../vault-list";
import type { CredentialFamily, VaultScope } from "../types";
import { useAppSelector } from "@/lib/redux/hooks";
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

/** Route navigation keeps this boundary mounted; a change of person remounts its in-memory view state. */
export function VaultRouteWorkspaceStateBoundary({ children }: { children: React.ReactNode }) {
  const actorId = useAppSelector(selectUserId);
  // Keyed by the person only: the active organization never resets the list (favorites and
  // filters are per person; switching where new things are saved must not throw them away).
  return <VaultRouteWorkspaceStateProvider key={actorId ?? ""}>
    {children}
  </VaultRouteWorkspaceStateProvider>;
}

export function useVaultRouteWorkspaceState() {
  return useContext(VaultRouteWorkspaceStateContext);
}
