"use client";

/**
 * VaultWorkspace — THE definition-driven credential vault UI for BOTH
 * principals (personal | organization). One list/search/create/detail
 * surface; organization-only controls appear via capabilities, never as
 * a second implementation. See features/secrets/FEATURE.md.
 *
 * The list is modelled on the best password managers: every row carries its
 * own identity (what kind of credential this is), the account it signs in as,
 * and — the job people actually came for — a one-click path to the value.
 */
import { useState } from "react";
import {
  AlertCircle,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

import { useVault, useVaultDefinitions } from "../vault-hooks";
import {
  credentialIdentity,
  fieldLabelOf,
  identityFieldOf,
  primarySecretFieldOf,
  IDENTITY_TILE_CLASS,
} from "../credential-identity";
import {
  FAMILY_LABELS,
  VAULT_LABELS,
  type CredentialDefinition,
  type CredentialFamily,
  type VaultItem,
  type VaultPrincipal,
  type VaultScope,
} from "../types";
import { SecretValue } from "./SecretValue";
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
  selectedItemId?: string | null;
  onSelectedItemIdChange?: (id: string | null) => void;
  scope?: string;
  onScopeChange?: (scope: string) => void;
}

export function VaultWorkspace({
  principal,
  canManage,
  selectedItemId,
  onSelectedItemIdChange,
  scope: controlledScope,
  onScopeChange,
}: VaultWorkspaceProps) {
  const orgAdmin =
    principal.type === "organization" ? Boolean(canManage) : true;
  // The personal surface offers Mine / Shared with me; the organization
  // surface is always its own scope (an org page showing another person's
  // shared personal items would be a category error).
  const [uncontrolledScope, setUncontrolledScope] = useState<"mine" | "shared">(
    "mine",
  );
  const personalScope: "mine" | "shared" =
    controlledScope === "shared" || controlledScope === "mine"
      ? controlledScope
      : uncontrolledScope;
  const setPersonalScope = (next: "mine" | "shared") => {
    setUncontrolledScope(next);
    onScopeChange?.(next);
  };
  const scope: VaultScope =
    principal.type === "organization"
      ? { kind: "organization", organizationId: principal.organizationId }
      : personalScope === "shared"
        ? { kind: "shared" }
        : { kind: "mine" };
  const isShared = scope.kind === "shared";

  const vault = useVault(scope, { orgAdmin });
  const { definitions } = useVaultDefinitions();

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
  const selectedIdentity = selected
    ? credentialIdentity(selected, defsByKey.get(selected.definition_key))
    : null;
  const SelectedIcon = selectedIdentity?.icon ?? KeyRound;

  const filtering = query.length > 0 || family !== "all";

  return (
    <div className="space-y-3">
      {principal.type === "organization" && (
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
                aria-selected={personalScope === value}
                onClick={() => {
                  setPersonalScope(value);
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  personalScope === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "mine" ? "Mine" : "Shared with me"}
              </button>
            ))}
          </div>
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
                principal={principal}
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
        principal={principal}
        definitions={definitions}
        busy={vault.busy}
        onCreate={vault.actions.createItem}
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

function familyOf(
  item: VaultItem,
  defsByKey: Map<string, CredentialDefinition>,
): CredentialFamily | null {
  return defsByKey.get(item.definition_key)?.payload.family ?? null;
}

/**
 * One credential, the way a password manager shows one: identity tile, the
 * name, type, and every stored field. Nothing is collapsed into “more” and
 * nothing is truncated: metadata wraps, while values have exactly two states
 * — Hidden or fully shown.
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
  const identityField = identityFieldOf(item);
  const secretField = primarySecretFieldOf(item);
  const primaryIds = new Set(
    [identityField?.id, secretField?.id].filter((id): id is string =>
      Boolean(id),
    ),
  );
  const orderedFields = [
    ...(identityField ? [identityField] : []),
    ...(secretField ? [secretField] : []),
    ...item.fields.filter((field) => !primaryIds.has(field.id)),
  ];
  const fieldLabels = new Map(
    (definition?.payload.fields ?? []).map((field) => [
      field.field_key,
      field.label,
    ]),
  );

  return (
    <div className="group relative min-w-0 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-within:border-primary/40">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn(IDENTITY_TILE_CLASS, "mt-0.5 h-9 w-9")}>
          <Icon className={cn("h-4.5 w-4.5", identity.iconClass)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {VAULT_LABELS.credentialName}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="min-w-0 whitespace-normal break-words text-sm font-semibold text-foreground">
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
          {(identity.kindLabel || identity.subtitle) && (
            <div className="mt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {VAULT_LABELS.credentialType}
              </p>
              <p className="whitespace-normal break-words text-xs text-muted-foreground">
                {[identity.kindLabel, identity.subtitle]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>
        {item.organization_id && item.access_mode === "restricted" && (
          <Badge variant="outline" className="shrink-0 font-normal">
            Restricted
          </Badge>
        )}
      </div>

      {orderedFields.length > 0 && (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
          {orderedFields.map((field) => (
            <CardFieldRow
              key={field.id}
              item={item}
              field={field}
              label={fieldLabels.get(field.field_key) ?? null}
            />
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpen}
          aria-label={`Open ${item.display_name}`}
        >
          Open credential
        </Button>
      </div>
    </div>
  );
}

/**
 * A value line on the card. Values remain independently revealable/copyable;
 * opening the full credential is a separate, explicit card action.
 */
function CardFieldRow({
  item,
  field,
  label,
}: {
  item: VaultItem;
  field: import("../types").VaultField;
  label: string | null;
}) {
  const displayLabel = fieldLabelOf(field, label);
  return (
    <div className="min-w-0 rounded-md bg-muted/30 p-2">
      <dl className="grid min-w-0 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="font-medium text-muted-foreground">
          {VAULT_LABELS.fieldName}
        </dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-1.5 whitespace-normal break-words text-foreground">
          {displayLabel}
          {!field.is_active && (
            <Badge variant="outline" className="font-normal">
              Inactive
            </Badge>
          )}
        </dd>
        {field.env_key && (
          <>
            <dt className="font-medium text-muted-foreground">
              {VAULT_LABELS.runtimeKey}
            </dt>
            <dd className="min-w-0 whitespace-normal break-all font-mono text-foreground">
              {field.env_key}
            </dd>
          </>
        )}
        <dt className="font-medium text-muted-foreground">
          {VAULT_LABELS.value}
        </dt>
        <dd className="min-w-0">
          <SecretValue item={item} field={field} className="min-w-0" />
        </dd>
      </dl>
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
          <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
            <Skeleton className="h-3 w-1/2" />
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
