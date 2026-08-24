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
import { useState } from "react";
import {
  AlertCircle,
  Building2,
  KeyRound,
  List,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUserOrganizations } from "@/features/organizations/hooks";
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
import { VaultCreateDialog } from "./VaultCreateDialog";
import { VaultEnvImportDialog } from "./VaultEnvImportDialog";
import { VaultItemDetail } from "./VaultItemDetail";

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
  const availableOrganizations = organizations.filter((org) => !org.isPersonal);
  const [uncontrolledScope, setUncontrolledScope] = useState<VaultScope>({
    kind: "mine",
  });
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
        : activeOrganization?.role === "owner" ||
          activeOrganization?.role === "admin"
      : true;
  const viewedPrincipal = scopeToPrincipal(scope) ?? { type: "user" };
  const isShared = scope.kind === "shared";

  const vault = useVault(scope, { orgAdmin });
  const { definitions } = useVaultDefinitions();
  const desktopWorkspace = useMediaQuery("(min-width: 1024px)");

  const defsByKey = new Map(definitions.map((d) => [d.key, d]));

  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<"all" | CredentialFamily>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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

  const familiesPresent = (() => {
    const present = new Set<CredentialFamily>();
    for (const item of vault.items) {
      const fam = familyOf(item, defsByKey);
      if (fam) present.add(fam);
    }
    return [...present].sort();
  })();

  const query = search.trim().toLowerCase();
  const filtered = vault.items.filter((item) => {
    if (family !== "all" && familyOf(item, defsByKey) !== family) return false;
    if (!query) return true;
    const def = defsByKey.get(item.definition_key);
    const haystack = [
      item.display_name,
      item.description ?? "",
      item.definition_key,
      item.provider_key ?? "",
      def?.payload.label ?? "",
      ...item.login_urls,
      ...item.tags,
      ...item.fields.map((f) => `${f.field_key} ${f.env_key ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const selected = selectedId
    ? (vault.items.find((i) => i.id === selectedId) ?? null)
    : null;
  const detailItem =
    presentation === "full"
      ? selectedId
        ? selected
        : (filtered[0] ?? null)
      : selected;
  const selectedIdentity = detailItem
    ? credentialIdentity(detailItem, defsByKey.get(detailItem.definition_key))
    : null;
  const SelectedIcon = selectedIdentity?.icon ?? KeyRound;

  const filtering = query.length > 0 || family !== "all";

  if (presentation === "full") {
    return (
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
                            activeOrganization?.id ??
                            availableOrganizations[0]?.id;
                          if (!organizationId) return;
                          setUserScope({
                            kind: "organization",
                            organizationId,
                          });
                          setSelectedId(null);
                        }}
                      />
                      {scope.kind === "organization" && (
                        <Select
                          value={scope.organizationId}
                          onValueChange={(organizationId) => {
                            setUserScope({
                              kind: "organization",
                              organizationId,
                            });
                            setSelectedId(null);
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-full"
                            aria-label="Organization vault"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOrganizations.map((org) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                            activeOrganization?.id ??
                            availableOrganizations[0]?.id;
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
                {principal.type === "user" && scope.kind === "organization" && (
                  <Select
                    value={scope.organizationId}
                    onValueChange={(organizationId) => {
                      setUserScope({
                        kind: "organization",
                        organizationId,
                      });
                      setSelectedId(null);
                    }}
                  >
                    <SelectTrigger
                      className="h-8 w-auto min-w-40"
                      aria-label="Organization vault"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOrganizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              </div>

              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
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
                )}
              </div>
            </div>

            {vault.error && (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {vault.error}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {vault.loading ? (
                <VaultWorkspaceListSkeleton />
              ) : filtered.length === 0 ? (
                <VaultEmptyState
                  filtering={filtering}
                  isShared={isShared}
                  canCreate={canCreate}
                  onClearFilters={() => {
                    setSearch("");
                    setFamily("all");
                  }}
                  onCreate={() => setCreateOpen(true)}
                />
              ) : (
                <div
                  className="space-y-1"
                  role="listbox"
                  aria-label="Credentials"
                >
                  {filtered.map((item) => (
                    <VaultWorkspaceListRow
                      key={item.id}
                      item={item}
                      definition={defsByKey.get(item.definition_key)}
                      selected={detailItem?.id === item.id}
                      onOpen={() => setSelectedId(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="hidden min-h-0 min-w-0 flex-col lg:flex">
            {detailItem ? (
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
      </div>
    );
  }

  return (
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
                  const organizationId =
                    activeOrganization?.id ?? availableOrganizations[0]?.id;
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
        {principal.type === "user" && scope.kind === "organization" && (
          <Select
            value={scope.organizationId}
            onValueChange={(organizationId) => {
              setUserScope({ kind: "organization", organizationId });
              setSelectedId(null);
            }}
          >
            <SelectTrigger
              className="h-8 w-auto min-w-40"
              aria-label="Organization vault"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableOrganizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        {canCreate && (
          <>
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
        </div>
      )}

      {/* List */}
      {vault.loading ? (
        <VaultListSkeleton />
      ) : filtered.length === 0 ? (
        <VaultEmptyState
          filtering={filtering}
          isShared={isShared}
          canCreate={canCreate}
          onClearFilters={() => {
            setSearch("");
            setFamily("all");
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
                onOpen={() => setSelectedId(item.id)}
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
    </div>
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

function VaultWorkspaceListRow({
  item,
  definition,
  selected,
  onOpen,
}: {
  item: VaultItem;
  definition: CredentialDefinition | undefined;
  selected: boolean;
  onOpen: () => void;
}) {
  const identity = credentialIdentity(item, definition);
  const Icon = identity.icon;
  const supportingLine =
    identity.subtitle ?? identity.host ?? identity.kindLabel;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onOpen}
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 rounded-md border px-2.5 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-transparent hover:border-border hover:bg-accent/50",
      )}
    >
      <span className={cn(IDENTITY_TILE_CLASS, "mt-0.5 h-9 w-9")}>
        <Icon className={cn("h-4.5 w-4.5", identity.iconClass)} />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-semibold leading-5 text-foreground">
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
      {item.status !== "active" && (
        <Badge
          variant="outline"
          className="shrink-0 border-warning/40 font-normal capitalize text-warning"
        >
          {item.status.replaceAll("_", " ")}
        </Badge>
      )}
    </button>
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
  onClose,
}: {
  open: boolean;
  selected: VaultItem | null;
  selectedIdentity: ReturnType<typeof credentialIdentity> | null;
  principal: VaultPrincipal;
  definitions: Map<string, CredentialDefinition>;
  busy: boolean;
  actions: VaultActions;
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
  onOpen,
}: {
  item: VaultItem;
  definition: CredentialDefinition | undefined;
  onOpen: () => void;
}) {
  const identity = credentialIdentity(item, definition);
  const Icon = identity.icon;
  const supportingLine =
    identity.subtitle ?? identity.host ?? identity.kindLabel;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full min-w-0 items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${item.display_name}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className={cn(IDENTITY_TILE_CLASS, "mt-0.5 h-9 w-9")}>
          <Icon className={cn("h-4.5 w-4.5", identity.iconClass)} />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
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
      </div>
    </button>
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
  isShared,
  canCreate,
  onClearFilters,
  onCreate,
}: {
  filtering: boolean;
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
          Nothing here matches your search or type filter.
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
