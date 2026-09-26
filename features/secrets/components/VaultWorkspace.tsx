"use client";

/**
 * VaultWorkspace — THE definition-driven credential vault UI for BOTH
 * principals (personal | organization). One list/search/create/detail
 * surface; organization-only controls appear via capabilities, never as
 * a second implementation. See features/secrets/FEATURE.md.
 *
 * The list is modelled on the best password managers: one identity line and
 * one concise supporting line. Values and full metadata belong in detail.
 */
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  Download,
  KeyRound,
  List,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Star,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Skeleton } from "@ai-matrx/design-system";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
// object-org-exempt: only the Organization list tab and item-state keying read it; a routed credential opens by useCredentialHome
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { cn } from "@/utils/cn";

import {
  useVault,
  useVaultDefinitions,
  type VaultActions,
  useCredentialHome,
} from "../vault-hooks";
import {
  credentialIdentity,
  IDENTITY_TILE_CLASS,
} from "../credential-identity";
import {
  FAMILY_LABELS,
  type CredentialDefinition,
  type CredentialFamily,
  type VaultItem,
  type VaultPrincipal,
  type VaultScope,
  parseVaultScopeKey,
  scopeToPrincipal,
  vaultScopeKey,
} from "../types";
import {
  filterAndSortVaultItems,
  VAULT_LIST_SORT_OPTIONS,
  type VaultListSort,
} from "../vault-list";
import { useVaultItemState } from "../use-vault-item-state";
import { useVaultRouteWorkspaceState } from "./VaultRouteWorkspaceState";
import { VaultContextMenu } from "./VaultContextMenu";
import { VaultCreateDialog } from "./VaultCreateDialog";
import { VaultEnvImportDialog } from "./VaultEnvImportDialog";
import { VaultCsvImportDialog } from "./VaultCsvImportDialog";
import { VaultLoginExportDialog } from "./VaultLoginExportDialog";
import { VaultBackupDialog } from "./VaultBackupDialog";
import { VaultItemDetail } from "./VaultItemDetail";
import { orgNameDistinguisher } from "@/features/scopes/utils/formatOrgDisplayName";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface VaultWorkspaceProps {
  principal: VaultPrincipal;
  /** Org-admin flag from the host (OrgManage `canManageSettings`). Ignored
   *  for the personal principal — owners always hold full capabilities. */
  canManage?: boolean;
  /** Optional controlled selection/scope, so a host that persists its own
   *  position (the window panel) can restore it. Omit both and the workspace
   *  manages them internally, which is what the page surfaces do. */
  presentation?: "full" | "compact";
  selectedItemId?: string | null;
  onSelectedItemIdChange?: (id: string | null) => void;
  scope?: string;
  onScopeChange?: (scope: string) => void;
}

export function VaultWorkspace({
  principal,
  canManage,
  presentation = "compact",
  selectedItemId,
  onSelectedItemIdChange,
  scope: controlledScope,
  onScopeChange,
}: VaultWorkspaceProps) {
  const { organizations } = useUserOrganizations();
  // ACCESS IS PERSONAL (owner, 2026-09-23): a routed credential opens in the
  // scope that HOLDS it — read from the credential, never from the
  // organization the person is working in. The list scope then shows (and
  // names) where it lives; the scope tabs stay the visible change/all control.
  const routedHome = useCredentialHome(
    selectedItemId,
    principal.type === "user",
  );
  const routedHomeScope: VaultScope | null =
    routedHome?.state === "found" ? routedHome.scope : null;
  const routedHomeOrganizationId =
    routedHomeScope?.kind === "organization"
      ? routedHomeScope.organizationId
      : null;
  const availableOrganizations = organizations.filter(
    (org) => !org.isPersonal || org.id === routedHomeOrganizationId,
  );
  // Switching to the Organization tab acts in the organization the person
  // SELECTED — never the first one they happen to belong to. A
  // first-membership pick showed (and let them write) another tenant's
  // credentials without anyone choosing it. With no selection the tab says so
  // and changes nothing; the Select beside it stays the explicit picker.
  // common-docs/policies/context-is-carried-never-rebuilt.md
  // object-org-exempt: picks which organization the visible Organization LIST tab shows; never whether a routed credential opens
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const actorId = useAppSelector(selectUserId);
  const routeWorkspaceState = useVaultRouteWorkspaceState();
  const scopeSwitchOrganizationId =
    availableOrganizations.find((org) => org.id === selectedOrganizationId)
      ?.id ?? null;
  /**
   * 🚨 THE ORGANIZATION TAB IS NEVER A DEAD CONTROL (lane ACCESS-FIX-18, VERIFIER-18 M4). With
   * no usable selection — none picked, or the one picked is a personal workspace, which has no
   * Organization list — pressing it used to raise a toast and change nothing; clicked twice on
   * production, "nothing says why". Now it opens the organization's credentials:
   *   · the organization the person is working in, when it has a list;
   *   · the one organization they belong to, when there is exactly one;
   *   · otherwise the organization chooser opens right there, and the pick opens that list.
   * Still never a silent first-membership pick (d30f8934e0): with several, THEY choose, and the
   * chooser beside the tab names which list is showing afterwards.
   */
  const [organizationChooser, setOrganizationChooser] = useState<
    "aside" | "bar" | "compact" | null
  >(null);
  const switchToOrganizationScope = (
    from: "aside" | "bar" | "compact",
  ): string | null => {
    if (scopeSwitchOrganizationId) return scopeSwitchOrganizationId;
    if (availableOrganizations.length === 1)
      return availableOrganizations[0]!.id;
    setOrganizationChooser(from);
    return null;
  };
  const chooseOrganizationVault = (organizationId: string) => {
    setOrganizationChooser(null);
    setUserScope({ kind: "organization", organizationId });
    setSelectedId(null);
  };
  const [localUncontrolledScope, setLocalUncontrolledScope] =
    useState<VaultScope>({
      kind: "mine",
    });
  const uncontrolledScope =
    routeWorkspaceState?.scope ?? localUncontrolledScope;
  const setUncontrolledScope =
    routeWorkspaceState?.setScope ?? setLocalUncontrolledScope;
  const requestedUserScope =
    parseVaultScopeKey(controlledScope) ?? uncontrolledScope;
  const userScope: VaultScope =
    requestedUserScope.kind !== "organization" ||
    availableOrganizations.some(
      (org) => org.id === requestedUserScope.organizationId,
    )
      ? requestedUserScope
      : { kind: "mine" };
  const setUserScope = (next: VaultScope) => {
    setUncontrolledScope(next);
    onScopeChange?.(vaultScopeKey(next));
  };
  const scope: VaultScope =
    principal.type === "organization"
      ? { kind: "organization", organizationId: principal.organizationId }
      : userScope;
  const activeOrganization =
    scope.kind === "organization"
      ? availableOrganizations.find((org) => org.id === scope.organizationId)
      : undefined;
  const orgAdmin =
    scope.kind === "organization"
      ? principal.type === "organization"
        ? Boolean(canManage)
        : Boolean(
            activeOrganization?.role === "owner" ||
            activeOrganization?.role === "admin",
          )
      : true;
  const viewedPrincipal = scopeToPrincipal(scope) ?? { type: "user" };
  const isShared = scope.kind === "shared";

  const vault = useVault(scope, { orgAdmin });
  const { definitions } = useVaultDefinitions();
  const desktopWorkspace = useMediaQuery("(min-width: 1024px)");

  const defsByKey = new Map(definitions.map((d) => [d.key, d]));

  const [localSearch, setLocalSearch] = useState("");
  const [localFamily, setLocalFamily] = useState<"all" | CredentialFamily>(
    "all",
  );
  const [localSort, setLocalSort] = useState<VaultListSort>("newest");
  const [localFavoritesOnly, setLocalFavoritesOnly] = useState(false);
  const search = routeWorkspaceState?.search ?? localSearch;
  const setSearch = routeWorkspaceState?.setSearch ?? setLocalSearch;
  const family = routeWorkspaceState?.family ?? localFamily;
  const setFamily = routeWorkspaceState?.setFamily ?? setLocalFamily;
  const sort = routeWorkspaceState?.sort ?? localSort;
  const setSort = routeWorkspaceState?.setSort ?? setLocalSort;
  const favoritesOnly =
    routeWorkspaceState?.favoritesOnly ?? localFavoritesOnly;
  const setFavoritesOnly =
    routeWorkspaceState?.setFavoritesOnly ?? setLocalFavoritesOnly;
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState<
    string | null
  >(null);
  const selectedId =
    selectedItemId !== undefined ? selectedItemId : uncontrolledSelectedId;
  const setSelectedId = (next: string | null) => {
    setUncontrolledSelectedId(next);
    onSelectedItemIdChange?.(next);
  };
  // Creating is meaningless in "Shared with me" — those items are owned by
  // someone else.
  const canCreate = orgAdmin && !isShared;
  // Export is deliberately narrower than the general item capabilities: only
  // the currently loaded Mine scope can request a selected personal export.
  const canExport = principal.type === "user" && scope.kind === "mine";
  const vaultItemState = useVaultItemState({
    actorId,
    organizationId: selectedOrganizationId,
    scopeKey: vaultScopeKey(scope),
    itemIds: vault.items.map((item) => item.id),
  });

  const familiesPresent = (() => {
    const present = new Set<CredentialFamily>();
    for (const item of vault.items) {
      const fam = familyOf(item, defsByKey);
      if (fam) present.add(fam);
    }
    return [...present].sort();
  })();

  const query = search.trim();
  const listed = filterAndSortVaultItems({
    items: vault.items,
    definitions,
    family,
    query,
    sort,
    stateById: vaultItemState.stateById,
  });
  const filtered =
    favoritesOnly && vaultItemState.status === "ready"
      ? listed.filter(
          (item) => vaultItemState.stateById.get(item.id)?.isFavorite,
        )
      : listed;

  const selected = selectedId
    ? (vault.items.find((i) => i.id === selectedId) ?? null)
    : null;
  const detailItem =
    presentation === "full"
      ? selectedId
        ? selected
        : (filtered[0] ?? null)
      : selected;
  // A routed item id (/vault/[itemId]) that the loaded vault does not hold:
  // the detail pane renders AccessGate for it instead of silently showing
  // "Select a credential" as if nothing had been asked for.
  // Only when the credential itself says she cannot open it (or we could not
  // ask) — a credential that lives in another scope is carried there below.
  const routedItemMissing =
    !!selectedItemId &&
    !selected &&
    !vault.loading &&
    !vault.error &&
    (principal.type !== "user" ||
      routedHome?.state === "not-given" ||
      routedHome?.state === "unavailable");
  // Carry a routed credential to the scope that holds it, once per id, so a
  // later deliberate scope change by the person is never overridden.
  const carriedTo = useRef<string | null>(null);
  const routedHomeKey = routedHomeScope ? vaultScopeKey(routedHomeScope) : null;
  const viewedScopeKey = vaultScopeKey(scope);
  const homeListable =
    routedHomeScope?.kind !== "organization" ||
    availableOrganizations.some((org) => org.id === routedHomeOrganizationId);
  useEffect(() => {
    if (principal.type !== "user" || !selectedItemId || !routedHomeScope)
      return;
    if (carriedTo.current === selectedItemId) return;
    if (!homeListable) return;
    carriedTo.current = selectedItemId;
    if (routedHomeKey !== viewedScopeKey) setUserScope(routedHomeScope);
    // setUserScope is a fresh closure each render; the id + keys decide.
  }, [
    principal.type,
    selectedItemId,
    routedHomeKey,
    viewedScopeKey,
    homeListable,
  ]);
  const selectedIdentity = detailItem
    ? credentialIdentity(detailItem, defsByKey.get(detailItem.definition_key))
    : null;
  const SelectedIcon = selectedIdentity?.icon ?? KeyRound;

  const filtering = query.length > 0 || family !== "all" || favoritesOnly;
  const deepLinkTouch = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedItemId || !selected) return;
    const touchKey = `${actorId ?? ""}\u0000${selectedOrganizationId ?? ""}\u0000${vaultScopeKey(scope)}\u0000${selectedItemId}`;
    if (
      !touchKey ||
      vaultItemState.status !== "ready" ||
      deepLinkTouch.current === touchKey
    )
      return;
    void vaultItemState.touch(selectedItemId, touchKey).then((touched) => {
      if (touched) deepLinkTouch.current = touchKey;
    });
  }, [
    actorId,
    selectedItemId,
    selected,
    selectedOrganizationId,
    scope,
    vaultItemState,
  ]);
  const openItem = (itemId: string) => {
    setSelectedId(itemId);
    void vaultItemState.touch(itemId);
  };

  // ONE menu per pane, wrapped around BOTH presentations, so the /vault page
  // and the floating Vault window share a single wiring (and the window
  // therefore mounts its own menu instead of being answered by the page
  // underneath it). Everything the menu may say about a credential is built in
  // `VaultContextMenu` — read its header before changing what it emits.
  const withMenu = (body: ReactNode) => (
    <VaultContextMenu
      items={vault.items}
      definitionsByKey={defsByKey}
      onOpenItem={openItem}
    >
      {body}
    </VaultContextMenu>
  );

  if (presentation === "full") {
    return withMenu(
      <div className="h-full min-h-0 bg-background">
        <div className="grid h-full min-h-0 overflow-hidden border-t border-border bg-background lg:grid-cols-[14rem_20rem_minmax(0,1fr)] xl:grid-cols-[15rem_22rem_minmax(0,1fr)]">
          <aside className="hidden min-h-0 flex-col border-r border-border bg-muted/20 lg:flex">
            <div className="border-b border-border px-3 py-3.5">
              <div className="flex items-center gap-2">
                <span className={cn(IDENTITY_TILE_CLASS, "h-7 w-7")}>
                  {scope.kind === "organization" ? (
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <UserRound className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="whitespace-normal break-words text-sm font-semibold text-foreground">
                    {scope.kind === "organization"
                      ? (activeOrganization?.name ?? "Organization vault")
                      : "Personal vault"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Encrypted and private
                  </p>
                </div>
              </div>
            </div>

            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
              aria-label="Vault views"
            >
              {principal.type === "user" ? (
                <>
                  <VaultNavButton
                    active={scope.kind === "mine"}
                    icon={List}
                    label="My credentials"
                    count={scope.kind === "mine" ? vault.items.length : null}
                    onClick={() => {
                      setUserScope({ kind: "mine" });
                      setSelectedId(null);
                    }}
                  />
                  <VaultNavButton
                    active={favoritesOnly}
                    icon={Star}
                    label="Favorites"
                    count={
                      vaultItemState.status === "ready"
                        ? [...vaultItemState.stateById.values()].filter(
                            (state) => state.isFavorite,
                          ).length
                        : null
                    }
                    onClick={() => setFavoritesOnly((value) => !value)}
                  />
                  <VaultNavButton
                    active={scope.kind === "shared"}
                    icon={Share2}
                    label="Shared with me"
                    count={scope.kind === "shared" ? vault.items.length : null}
                    onClick={() => {
                      setUserScope({ kind: "shared" });
                      setSelectedId(null);
                    }}
                  />
                  {availableOrganizations.length > 0 && (
                    <>
                      <VaultNavButton
                        active={scope.kind === "organization"}
                        icon={Building2}
                        label="Organization"
                        count={
                          scope.kind === "organization"
                            ? vault.items.length
                            : null
                        }
                        onClick={() => {
                          const organizationId =
                            switchToOrganizationScope("aside");
                          if (!organizationId) return;
                          setUserScope({
                            kind: "organization",
                            organizationId,
                          });
                          setSelectedId(null);
                        }}
                      />
                      {(scope.kind === "organization" ||
                        organizationChooser === "aside") && (
                        <OrganizationVaultChooser
                          value={
                            scope.kind === "organization"
                              ? scope.organizationId
                              : null
                          }
                          organizations={availableOrganizations}
                          open={organizationChooser === "aside"}
                          onOpenChange={(next) =>
                            setOrganizationChooser(next ? "aside" : null)
                          }
                          onPick={chooseOrganizationVault}
                          className="h-8 w-full"
                        />
                      )}
                    </>
                  )}
                </>
              ) : (
                <VaultNavButton
                  active
                  icon={Building2}
                  label="Organization credentials"
                  count={vault.items.length}
                  onClick={() => undefined}
                />
              )}

              {familiesPresent.length > 1 && (
                <>
                  <p className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Types
                  </p>
                  <VaultNavButton
                    active={family === "all"}
                    icon={KeyRound}
                    label="All types"
                    count={vault.items.length}
                    onClick={() => {
                      setFamily("all");
                      setSelectedId(null);
                    }}
                  />
                  {familiesPresent.map((fam) => (
                    <VaultNavButton
                      key={fam}
                      active={family === fam}
                      icon={KeyRound}
                      label={FAMILY_LABELS[fam]}
                      count={
                        vault.items.filter(
                          (item) => familyOf(item, defsByKey) === fam,
                        ).length
                      }
                      onClick={() => {
                        setFamily(fam);
                        setSelectedId(null);
                      }}
                    />
                  ))}
                </>
              )}
            </nav>

            {scope.kind === "organization" && (
              <div className="border-t border-border p-3">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p>Members can use approved values without revealing them.</p>
                </div>
              </div>
            )}
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col border-r border-border">
            <div className="space-y-2 border-b border-border px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                {principal.type === "user" && (
                  <div
                    role="tablist"
                    aria-label="Vault scope"
                    className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
                  >
                    {(["mine", "shared"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={scope.kind === value}
                        onClick={() => {
                          setUserScope({ kind: value });
                          setSelectedId(null);
                        }}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          scope.kind === value
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {value === "mine" ? "My credentials" : "Shared with me"}
                      </button>
                    ))}
                    {availableOrganizations.length > 0 && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={scope.kind === "organization"}
                        onClick={() => {
                          const organizationId =
                            switchToOrganizationScope("bar");
                          if (!organizationId) return;
                          setUserScope({
                            kind: "organization",
                            organizationId,
                          });
                          setSelectedId(null);
                        }}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          scope.kind === "organization"
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Organization
                      </button>
                    )}
                  </div>
                )}
                {principal.type === "user" &&
                  (scope.kind === "organization" ||
                    organizationChooser === "bar") && (
                    <OrganizationVaultChooser
                      value={
                        scope.kind === "organization"
                          ? scope.organizationId
                          : null
                      }
                      organizations={availableOrganizations}
                      open={organizationChooser === "bar"}
                      onOpenChange={(next) =>
                        setOrganizationChooser(next ? "bar" : null)
                      }
                      onPick={chooseOrganizationVault}
                      className="h-8 w-auto min-w-40"
                    />
                  )}
                {familiesPresent.length > 1 && (
                  <Select
                    value={family}
                    onValueChange={(next) => {
                      setFamily(next as "all" | CredentialFamily);
                      setSelectedId(null);
                    }}
                  >
                    <SelectTrigger
                      className="h-8 w-auto min-w-32"
                      aria-label="Filter by credential type"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {familiesPresent.map((fam) => (
                        <SelectItem key={fam} value={fam}>
                          {FAMILY_LABELS[fam]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <VaultSortControl sort={sort} onSortChange={setSort} />
                <Button
                  variant={favoritesOnly ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => setFavoritesOnly((value) => !value)}
                  aria-pressed={favoritesOnly}
                >
                  <Star className="mr-1 h-3.5 w-3.5" /> Favorites
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 basis-40 lg:basis-full">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search credentials"
                    className="h-9 pl-8 pr-8"
                    aria-label="Search credentials"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <VaultSortControl
                  sort={sort}
                  onSortChange={setSort}
                  className="hidden lg:block"
                />
                {canCreate && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 rounded-full px-3"
                    onClick={() => setCreateOpen(true)}
                    disabled={vault.busy}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">New credential</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <p className="text-xs text-muted-foreground">
                  {filtered.length}
                  {filtered.length === vault.items.length
                    ? ""
                    : ` of ${vault.items.length}`}{" "}
                  credential{filtered.length === 1 ? "" : "s"}
                </p>
                {canCreate && (
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    {canExport && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setBackupOpen(true)}
                        disabled={vault.busy || vault.loading}
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Backup & restore
                      </Button>
                    )}
                    {canExport && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setExportOpen(true)}
                        disabled={vault.busy || vault.loading}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Export selected logins
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setImportOpen(true)}
                      disabled={vault.busy}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Import .env
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCsvImportOpen(true)}
                      disabled={vault.busy}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Import passwords
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {vault.error && (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {vault.error}
                <ErrorAlchemyMenu error={vault.error} />
              </div>
            )}
            {vaultItemState.status === "error" && !favoritesOnly && (
              <VaultItemStateUnavailable
                error={vaultItemState.error}
                onRetry={vaultItemState.retry}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {vault.loading ? (
                <VaultWorkspaceListSkeleton />
              ) : favoritesOnly && vaultItemState.status !== "ready" ? (
                <VaultItemStateUnavailable
                  error={vaultItemState.error}
                  onRetry={vaultItemState.retry}
                />
              ) : filtered.length === 0 ? (
                <VaultEmptyState
                  filtering={filtering}
                  favoritesOnly={favoritesOnly}
                  isShared={isShared}
                  canCreate={canCreate}
                  onClearFilters={() => {
                    setSearch("");
                    setFamily("all");
                    setFavoritesOnly(false);
                  }}
                  onCreate={() => setCreateOpen(true)}
                />
              ) : (
                <div className="space-y-1" role="list" aria-label="Credentials">
                  {filtered.map((item) => (
                    <VaultWorkspaceListRow
                      key={item.id}
                      item={item}
                      definition={defsByKey.get(item.definition_key)}
                      selected={detailItem?.id === item.id}
                      favorite={
                        vaultItemState.stateById.get(item.id)?.isFavorite ??
                        false
                      }
                      stateReady={
                        vaultItemState.status === "ready" &&
                        !vaultItemState.pendingItemIds.has(item.id)
                      }
                      onOpen={() => openItem(item.id)}
                      onToggleFavorite={() =>
                        void vaultItemState.toggleFavorite(item.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="hidden min-h-0 min-w-0 flex-col lg:flex">
            {routedItemMissing && selectedItemId ? (
              <AccessGate
                token="credential_item"
                id={selectedItemId}
                fallbackHref="/vault"
                fallbackLabel="Your vault"
              />
            ) : detailItem ? (
              <>
                <div className="flex min-w-0 items-start gap-3 border-b border-border px-5 py-4">
                  <span className={cn(IDENTITY_TILE_CLASS, "h-9 w-9")}>
                    <SelectedIcon
                      className={cn("h-4.5 w-4.5", selectedIdentity?.iconClass)}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-normal break-words text-base font-semibold leading-5 text-foreground">
                      {detailItem.display_name}
                    </p>
                    <p className="mt-0.5 whitespace-normal break-words text-xs text-muted-foreground">
                      {[selectedIdentity?.kindLabel, selectedIdentity?.subtitle]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <VaultItemDetail
                    key={detailItem.id}
                    item={detailItem}
                    principal={viewedPrincipal}
                    definitions={defsByKey}
                    busy={vault.busy}
                    actions={vault.actions}
                    onItemChanged={vault.refresh}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <span
                    className={cn(IDENTITY_TILE_CLASS, "mx-auto h-11 w-11")}
                  >
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                  </span>
                  <p className="mt-3 text-sm font-medium">
                    Select a credential
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Its fields and actions will appear here.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <VaultDetailDialog
          open={selected !== null && !desktopWorkspace}
          selected={selected}
          selectedIdentity={
            selected
              ? credentialIdentity(
                  selected,
                  defsByKey.get(selected.definition_key),
                )
              : null
          }
          principal={viewedPrincipal}
          definitions={defsByKey}
          busy={vault.busy}
          actions={vault.actions}
          onItemChanged={vault.refresh}
          onClose={() => setSelectedId(null)}
        />

        <VaultCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          principal={viewedPrincipal}
          definitions={definitions}
          busy={vault.busy}
          onCreate={(body, attachments) =>
            attachments?.length
              ? vault.actions.createItemWithAttachments(body, attachments)
              : vault.actions.createItem(body)
          }
          onAssign={vault.actions.assign}
        />
        <VaultEnvImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          busy={vault.busy}
          onImport={vault.actions.importEnv}
        />
        {canCreate && (
          <VaultCsvImportDialog
            open={csvImportOpen}
            onOpenChange={setCsvImportOpen}
            principal={viewedPrincipal}
            existingItems={vault.items.map((item) => ({
              displayName: item.display_name,
              loginUrls: item.login_urls,
            }))}
            onCommitted={vault.refresh}
          />
        )}
        {canExport && (
          <VaultBackupDialog
            open={backupOpen}
            onOpenChange={setBackupOpen}
            items={vault.items}
            onRestored={vault.refresh}
          />
        )}
        {canExport && (
          <VaultLoginExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            items={vault.items}
          />
        )}
      </div>,
    );
  }

  return withMenu(
    <div className="space-y-3">
      {scope.kind === "organization" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Members can use organization credentials without revealing them.
            </span>{" "}
            Values are encrypted at rest and only resolved inside trusted server
            operations. Admins manage access, rotation, and deletion.
          </p>
        </div>
      )}

      {/* Toolbar — scope, search, filter, and the two create paths in one band */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Scope — a deliberate destination, never a silent widening */}
        {principal.type === "user" && (
          <div
            role="tablist"
            aria-label="Vault scope"
            className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5"
          >
            {(["mine", "shared"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope.kind === value}
                onClick={() => {
                  setUserScope({ kind: value });
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  scope.kind === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "mine" ? "Mine" : "Shared with me"}
              </button>
            ))}
            {availableOrganizations.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={scope.kind === "organization"}
                onClick={() => {
                  const organizationId = switchToOrganizationScope("compact");
                  if (!organizationId) return;
                  setUserScope({ kind: "organization", organizationId });
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  scope.kind === "organization"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Organization
              </button>
            )}
          </div>
        )}
        {principal.type === "user" &&
          (scope.kind === "organization" ||
            organizationChooser === "compact") && (
            <OrganizationVaultChooser
              value={
                scope.kind === "organization" ? scope.organizationId : null
              }
              organizations={availableOrganizations}
              open={organizationChooser === "compact"}
              onOpenChange={(next) =>
                setOrganizationChooser(next ? "compact" : null)
              }
              onPick={chooseOrganizationVault}
              className="h-8 w-auto min-w-40"
            />
          )}

        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vault"
            className="h-9 pl-8 pr-8"
            aria-label="Search credentials"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {familiesPresent.length > 1 && (
          <Select
            value={family}
            onValueChange={(next) =>
              setFamily(next as "all" | CredentialFamily)
            }
          >
            <SelectTrigger
              className="h-9 w-auto min-w-32 shrink-0"
              aria-label="Filter by family"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {familiesPresent.map((fam) => (
                <SelectItem key={fam} value={fam}>
                  {FAMILY_LABELS[fam]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <VaultSortControl sort={sort} onSortChange={setSort} />
        <Button
          variant={favoritesOnly ? "secondary" : "outline"}
          size="sm"
          className="h-9 shrink-0"
          onClick={() => setFavoritesOnly((value) => !value)}
          aria-pressed={favoritesOnly}
        >
          <Star className="mr-1.5 h-4 w-4" />
          Favorites
        </Button>

        {canCreate && (
          <>
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => setBackupOpen(true)}
                disabled={vault.busy || vault.loading}
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Backup & restore
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => setExportOpen(true)}
                disabled={vault.busy || vault.loading}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Export selected logins
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setImportOpen(true)}
              disabled={vault.busy}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import .env
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setCsvImportOpen(true)}
              disabled={vault.busy}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import passwords
            </Button>
            <Button
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setCreateOpen(true)}
              disabled={vault.busy}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New credential
            </Button>
          </>
        )}
      </div>

      {vault.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {vault.error}
          <ErrorAlchemyMenu error={vault.error} />
        </div>
      )}
      {vaultItemState.status === "error" && !favoritesOnly && (
        <VaultItemStateUnavailable
          error={vaultItemState.error}
          onRetry={vaultItemState.retry}
        />
      )}

      {/* List */}
      {vault.loading ? (
        <VaultListSkeleton />
      ) : favoritesOnly && vaultItemState.status !== "ready" ? (
        <VaultItemStateUnavailable
          error={vaultItemState.error}
          onRetry={vaultItemState.retry}
        />
      ) : filtered.length === 0 ? (
        <VaultEmptyState
          filtering={filtering}
          favoritesOnly={favoritesOnly}
          isShared={isShared}
          canCreate={canCreate}
          onClearFilters={() => {
            setSearch("");
            setFamily("all");
            setFavoritesOnly(false);
          }}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <>
          <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <VaultItemCard
                key={item.id}
                item={item}
                definition={defsByKey.get(item.definition_key)}
                favorite={
                  vaultItemState.stateById.get(item.id)?.isFavorite ?? false
                }
                stateReady={
                  vaultItemState.status === "ready" &&
                  !vaultItemState.pendingItemIds.has(item.id)
                }
                onOpen={() => openItem(item.id)}
                onToggleFavorite={() =>
                  void vaultItemState.toggleFavorite(item.id)
                }
              />
            ))}
          </div>
          <p className="px-0.5 text-xs text-muted-foreground">
            {filtered.length}
            {filtered.length === vault.items.length
              ? ""
              : ` of ${vault.items.length}`}{" "}
            credential{filtered.length === 1 ? "" : "s"}
          </p>
        </>
      )}

      {/* Detail */}
      <Credenza
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <CredenzaContent className="md:max-w-2xl">
          <CredenzaHeader>
            <CredenzaTitle className="flex min-w-0 items-center gap-2.5 pr-6 text-left">
              <span className={cn(IDENTITY_TILE_CLASS, "h-9 w-9")}>
                <SelectedIcon
                  className={cn("h-4.5 w-4.5", selectedIdentity?.iconClass)}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block whitespace-normal break-words text-base font-semibold leading-tight">
                  {selected?.display_name}
                </span>
                <span className="mt-1 block whitespace-normal break-words text-xs font-normal text-muted-foreground">
                  {[selectedIdentity?.kindLabel, selectedIdentity?.subtitle]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody className="max-h-[70dvh] overflow-y-auto px-4 pb-6 md:px-0">
            {selected && (
              <VaultItemDetail
                key={selected.id}
                item={selected}
                principal={viewedPrincipal}
                definitions={defsByKey}
                busy={vault.busy}
                actions={vault.actions}
                onItemChanged={vault.refresh}
                onClose={() => setSelectedId(null)}
              />
            )}
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>

      {/* Create */}
      <VaultCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        principal={viewedPrincipal}
        definitions={definitions}
        busy={vault.busy}
        onCreate={(body, attachments) =>
          attachments?.length
            ? vault.actions.createItemWithAttachments(body, attachments)
            : vault.actions.createItem(body)
        }
        onAssign={vault.actions.assign}
      />

      {/* Bulk .env import */}
      <VaultEnvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        busy={vault.busy}
        onImport={vault.actions.importEnv}
      />
      {canCreate && (
        <VaultCsvImportDialog
          open={csvImportOpen}
          onOpenChange={setCsvImportOpen}
          principal={viewedPrincipal}
          existingItems={vault.items.map((item) => ({
            displayName: item.display_name,
            loginUrls: item.login_urls,
          }))}
          onCommitted={vault.refresh}
        />
      )}
      {canExport && (
        <VaultBackupDialog
          open={backupOpen}
          onOpenChange={setBackupOpen}
          items={vault.items}
          onRestored={vault.refresh}
        />
      )}
      {canExport && (
        <VaultLoginExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          items={vault.items}
        />
      )}
    </div>,
  );
}

function VaultSortControl({
  sort,
  onSortChange,
  className,
}: {
  sort: VaultListSort;
  onSortChange: (sort: VaultListSort) => void;
  className?: string;
}) {
  return (
    <Select
      value={sort}
      onValueChange={(value) => onSortChange(value as VaultListSort)}
    >
      <SelectTrigger
        className={cn("h-9 w-40 shrink-0", className)}
        aria-label="Sort credentials"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VAULT_LIST_SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function VaultNavButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof KeyRound;
  label: string;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors",
        active
          ? "bg-primary/10 font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon
        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active && "text-primary")}
      />
      <span className="min-w-0 flex-1 whitespace-normal break-words">
        {label}
      </span>
      {count !== null && (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The second line of a credential in any list. An empty credential is a fact, said plainly (lane
 * ERRORS-HONEST): it reads "Nothing saved in it yet" instead of a host or kind line that looks like
 * a saved login.
 */
function credentialSupportingLine(
  item: VaultItem,
  identity: ReturnType<typeof credentialIdentity>,
): string | null {
  if (item.fields.length === 0 && item.attachments.length === 0)
    return "Nothing saved in it yet";
  return identity.subtitle ?? identity.host ?? identity.kindLabel;
}

function VaultWorkspaceListRow({
  item,
  definition,
  selected,
  favorite,
  stateReady,
  onOpen,
  onToggleFavorite,
}: {
  item: VaultItem;
  definition: CredentialDefinition | undefined;
  selected: boolean;
  favorite: boolean;
  stateReady: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const identity = credentialIdentity(item, definition);
  const Icon = identity.icon;
  const supportingLine = credentialSupportingLine(item, identity);

  return (
    <div
      role="listitem"
      // The delegated context menu reads the clicked credential off this
      // attribute (`VAULT_ITEM_ATTR`) — never off the DOM text, which can hold
      // a revealed value.
      data-vault-item-id={item.id}
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 rounded-md border px-2.5 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-transparent hover:border-border hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        aria-label={`Open ${item.display_name}`}
      >
        <span className={cn(IDENTITY_TILE_CLASS, "mt-0.5 h-9 w-9")}>
          <Icon className={cn("h-4.5 w-4.5", identity.iconClass)} />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="whitespace-normal break-words text-sm font-semibold leading-5 text-foreground">
            {item.display_name}
          </p>
          {supportingLine && (
            <p
              className="mt-0.5 truncate text-xs leading-4 text-muted-foreground"
              title={supportingLine}
            >
              {supportingLine}
            </p>
          )}
        </div>
      </button>
      {item.status !== "active" && (
        <Badge
          variant="outline"
          className="shrink-0 border-warning/40 font-normal capitalize text-warning"
        >
          {item.status.replaceAll("_", " ")}
        </Badge>
      )}
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={!stateReady}
        aria-pressed={favorite}
        aria-label={`${favorite ? "Remove" : "Add"} ${item.display_name} ${favorite ? "from" : "to"} favorites`}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Star
          className={cn("h-4 w-4", favorite && "fill-current text-warning")}
        />
      </button>
    </div>
  );
}

function VaultWorkspaceListSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-lg border border-transparent p-3"
        >
          <Skeleton className="mt-0.5 h-9 w-9 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function VaultDetailDialog({
  open,
  selected,
  selectedIdentity,
  principal,
  definitions,
  busy,
  actions,
  onItemChanged,
  onClose,
}: {
  open: boolean;
  selected: VaultItem | null;
  selectedIdentity: ReturnType<typeof credentialIdentity> | null;
  principal: VaultPrincipal;
  definitions: Map<string, CredentialDefinition>;
  busy: boolean;
  actions: VaultActions;
  onItemChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const SelectedIcon = selectedIdentity?.icon ?? KeyRound;

  return (
    <Credenza
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <CredenzaContent className="md:max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle className="flex min-w-0 items-center gap-2.5 pr-6 text-left">
            <span className={cn(IDENTITY_TILE_CLASS, "h-9 w-9")}>
              <SelectedIcon
                className={cn("h-4.5 w-4.5", selectedIdentity?.iconClass)}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-normal break-words text-base font-semibold leading-tight">
                {selected?.display_name}
              </p>
              <p className="mt-1 whitespace-normal break-words text-xs font-normal text-muted-foreground">
                {[selectedIdentity?.kindLabel, selectedIdentity?.subtitle]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[70dvh] overflow-y-auto px-4 pb-6 md:px-0">
          {selected && (
            <VaultItemDetail
              key={selected.id}
              item={selected}
              principal={principal}
              definitions={definitions}
              busy={busy}
              actions={actions}
              onItemChanged={onItemChanged}
              onClose={onClose}
            />
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}

function familyOf(
  item: VaultItem,
  defsByKey: Map<string, CredentialDefinition>,
): CredentialFamily | null {
  return defsByKey.get(item.definition_key)?.payload.family ?? null;
}

/**
 * Compact hosts show the same two-line identity contract as the full route.
 * Values and complete metadata are available after opening the item.
 */
function VaultItemCard({
  item,
  definition,
  favorite,
  stateReady,
  onOpen,
  onToggleFavorite,
}: {
  item: VaultItem;
  definition: CredentialDefinition | undefined;
  favorite: boolean;
  stateReady: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const identity = credentialIdentity(item, definition);
  const Icon = identity.icon;
  const supportingLine = credentialSupportingLine(item, identity);

  return (
    <div
      className="group relative flex w-full min-w-0 items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
      data-vault-item-id={item.id}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${item.display_name}`}
      >
        <span className={cn(IDENTITY_TILE_CLASS, "mt-0.5 h-9 w-9")}>
          <Icon className={cn("h-4.5 w-4.5", identity.iconClass)} />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold text-foreground">
              {item.display_name}
            </p>
            {item.status !== "active" && (
              <Badge
                variant="outline"
                className="shrink-0 border-warning/40 font-normal capitalize text-warning"
              >
                {item.status.replaceAll("_", " ")}
              </Badge>
            )}
          </div>
          {supportingLine && (
            <p
              className="mt-0.5 truncate text-xs text-muted-foreground"
              title={supportingLine}
            >
              {supportingLine}
            </p>
          )}
        </div>
        {item.organization_id && item.access_mode === "restricted" && (
          <Badge variant="outline" className="shrink-0 font-normal">
            Restricted
          </Badge>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={!stateReady}
        aria-pressed={favorite}
        aria-label={`${favorite ? "Remove" : "Add"} ${item.display_name} ${favorite ? "from" : "to"} favorites`}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Star
          className={cn("h-4 w-4", favorite && "fill-current text-warning")}
        />
      </button>
    </div>
  );
}

function VaultItemStateUnavailable({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="m-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <span>{error ?? "Favorites are unavailable. Retry."}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function VaultListSkeleton() {
  return (
    <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-2.5">
            <Skeleton className="mt-0.5 h-9 w-9 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VaultEmptyState({
  filtering,
  favoritesOnly,
  isShared,
  canCreate,
  onClearFilters,
  onCreate,
}: {
  filtering: boolean;
  favoritesOnly: boolean;
  isShared: boolean;
  canCreate: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  if (filtering) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
        <Search className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2.5 text-sm font-medium">No credentials match</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
          Nothing here matches your active search, type, or favorites filter.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <span className={cn(IDENTITY_TILE_CLASS, "mx-auto h-11 w-11")}>
        <KeyRound className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="mt-3 text-sm font-medium">
        {isShared ? "Nothing shared with you yet" : "Your vault is empty"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
        {isShared
          ? "When someone shares a login, an API key, or a token with you, it appears here."
          : canCreate
            ? "Store a website login, an API key, or a whole .env file. Values are encrypted at rest and only revealed when you ask."
            : "An organization admin can add shared credentials here."}
      </p>
      {canCreate && !isShared && (
        <Button size="sm" className="mt-3.5" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add your first credential
        </Button>
      )}
    </div>
  );
}

/**
 * WHICH ORGANIZATION'S CREDENTIALS ARE SHOWING, AND THE WAY TO CHANGE IT — one control for the
 * three places the Organization tab lives. Opened by the tab itself when the person has not
 * said which organization (ACCESS-FIX-18); the pick opens that organization's list.
 */
function OrganizationVaultChooser({
  value,
  organizations,
  open,
  onOpenChange,
  onPick,
  className,
}: {
  value: string | null;
  organizations: ReadonlyArray<{
    id: string;
    name: string;
    slug?: string | null;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (organizationId: string) => void;
  className: string;
}) {
  return (
    <Select
      // ALWAYS CONTROLLED ("" = nothing chosen yet, the placeholder shows). Uncontrolled, Radix
      // reports the pick from an effect, after the pick has already closed — and unmounted —
      // this chooser, so the pick was lost.
      value={value ?? ""}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={onPick}
    >
      <SelectTrigger className={className} aria-label="Organization vault">
        <SelectValue placeholder="Choose an organization" />
      </SelectTrigger>
      <SelectContent>
        {organizations.map((org) => {
          // THE SAME NAME, TOLD APART (UI-FIX-19): keyed by id, and a shared name carries its address.
          const distinguisher = orgNameDistinguisher(org, organizations);
          return (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
              {distinguisher ? (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {distinguisher}
                </span>
              ) : null}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
