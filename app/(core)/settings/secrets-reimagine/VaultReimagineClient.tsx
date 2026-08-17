"use client";

import { useState, type ComponentType } from "react";
import {
  AlertCircle,
  Braces,
  ChevronRight,
  FileKey2,
  Globe,
  KeyRound,
  Layers3,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";

import {
  TapTargetButton,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import SearchInput from "@/components/official/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { Skeleton } from "@/components/ui/skeleton";
import { VaultCreateDialog } from "@/features/secrets/components/VaultCreateDialog";
import { VaultEnvImportDialog } from "@/features/secrets/components/VaultEnvImportDialog";
import { VaultItemDetail } from "@/features/secrets/components/VaultItemDetail";
import { SecretValue } from "@/features/secrets/components/SecretValue";
import {
  credentialIdentity,
  fieldLabelOf,
  IDENTITY_TILE_CLASS,
  primarySecretFieldOf,
} from "@/features/secrets/credential-identity";
import {
  useVault,
  useVaultDefinitions,
} from "@/features/secrets/vault-hooks";
import {
  ENV_VALUE_DEFINITION_KEY,
  VAULT_LABELS,
  WEBSITE_LOGIN_DEFINITION_KEY,
  type CredentialDefinition,
  type VaultItem,
  type VaultScope,
} from "@/features/secrets/types";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { cn } from "@/lib/utils";

type LibrarySection =
  | "all"
  | "sign_ins"
  | "keys"
  | "environment"
  | "files"
  | "other";

interface SectionDefinition {
  key: LibrarySection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  { key: "all", label: "Everything", icon: Layers3 },
  { key: "sign_ins", label: "Website sign-ins", icon: Globe },
  { key: "keys", label: "Keys & tokens", icon: KeyRound },
  { key: "environment", label: "Environment values", icon: Braces },
  { key: "files", label: "Secure files", icon: FileKey2 },
  { key: "other", label: "Other credentials", icon: ShieldCheck },
] as const;

const DISPLAY_SECTIONS = SECTION_DEFINITIONS.filter(
  (section) => section.key !== "all",
);

function sectionOf(item: VaultItem): Exclude<LibrarySection, "all"> {
  if (item.definition_key === WEBSITE_LOGIN_DEFINITION_KEY) return "sign_ins";
  if (item.definition_key === ENV_VALUE_DEFINITION_KEY) return "environment";
  if (item.definition_key === "secure_file" || item.attachments.length > 0) {
    return "files";
  }
  if (
    item.definition_key === "api_key" ||
    item.fields.some((field) =>
      /(^|_)(api_key|token|secret|access_key|private_key)($|_)/.test(
        field.field_key,
      ),
    )
  ) {
    return "keys";
  }
  return "other";
}

function matchesSearch(
  item: VaultItem,
  definition: CredentialDefinition | undefined,
  query: string,
): boolean {
  if (!query) return true;
  return [
    item.display_name,
    item.description ?? "",
    definition?.payload.label ?? "",
    ...item.login_urls,
    ...item.tags,
    ...item.fields.map((field) => `${field.field_key} ${field.env_key ?? ""}`),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function VaultReimagineClient() {
  const [scopeKind, setScopeKind] = useState<"mine" | "shared">("mine");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<LibrarySection>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const scope: VaultScope = { kind: scopeKind };
  const vault = useVault(scope, { orgAdmin: true });
  const definitionsState = useVaultDefinitions();
  const definitionsByKey = new Map(
    definitionsState.definitions.map((definition) => [
      definition.key,
      definition,
    ]),
  );

  const query = search.trim().toLowerCase();
  const visibleItems = vault.items.filter((item) => {
    if (section !== "all" && sectionOf(item) !== section) return false;
    return matchesSearch(item, definitionsByKey.get(item.definition_key), query);
  });
  const selectedItem = selectedId
    ? (vault.items.find((item) => item.id === selectedId) ?? null)
    : null;
  const canCreate = scopeKind === "mine";

  const counts = new Map<LibrarySection, number>([["all", vault.items.length]]);
  for (const item of vault.items) {
    const itemSection = sectionOf(item);
    counts.set(itemSection, (counts.get(itemSection) ?? 0) + 1);
  }

  const grouped = DISPLAY_SECTIONS.map((definition) => ({
    definition,
    items: visibleItems.filter((item) => sectionOf(item) === definition.key),
  })).filter((group) => group.items.length > 0);

  const selectScope = (next: "mine" | "shared") => {
    setScopeKind(next);
    setSelectedId(null);
    setSection("all");
  };

  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ShieldCheck className="mr-2 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 text-sm font-semibold text-foreground">
              Credentials
            </span>
          </div>
        }
        center={
          <div className="mx-auto hidden w-full max-w-md md:block">
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Find a sign-in, key, or service"
              aria-label="Search credentials"
              inputClassName="h-8 bg-glass text-sm"
            />
          </div>
        }
        right={
          <>
            <TapTargetButton
              icon={<Upload />}
              ariaLabel="Import environment values"
              onClick={() => setImportOpen(true)}
              disabled={!canCreate || vault.busy}
              tooltipSide="bottom"
            />
            <TapTargetButtonSolid
              icon={<Plus />}
              ariaLabel="Add credential"
              onClick={() => setCreateOpen(true)}
              disabled={!canCreate || vault.busy}
              tooltipSide="bottom"
            />
          </>
        }
      />

      <main className="h-full overflow-hidden bg-textured">
        <div className="h-full overflow-y-auto overscroll-contain pt-[var(--shell-header-h)] scrollbar-thin">
          <div className="mx-auto w-full max-w-6xl px-3 pb-12 pt-3 sm:px-5 sm:pt-4 lg:px-8">
            <div className="mb-3 md:hidden">
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Find a sign-in, key, or service"
                aria-label="Search credentials"
                inputClassName="h-11 bg-card text-base"
              />
            </div>

            <section
              aria-label="Credential owner"
              className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-1" role="group">
                <ScopeButton
                  active={scopeKind === "mine"}
                  icon={UserRound}
                  label="Mine"
                  count={scopeKind === "mine" ? vault.items.length : null}
                  onClick={() => selectScope("mine")}
                />
                <ScopeButton
                  active={scopeKind === "shared"}
                  icon={Share2}
                  label="Shared with me"
                  count={scopeKind === "shared" ? vault.items.length : null}
                  onClick={() => selectScope("shared")}
                />
              </div>
              <p className="px-2 text-xs leading-5 text-muted-foreground">
                Values stay hidden until you choose Show or Copy.
              </p>
            </section>

            <section aria-label="Credential types" className="mb-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {SECTION_DEFINITIONS.map((definition) => (
                  <SectionButton
                    key={definition.key}
                    definition={definition}
                    active={section === definition.key}
                    count={counts.get(definition.key) ?? 0}
                    onClick={() => setSection(definition.key)}
                  />
                ))}
              </div>
            </section>

            {vault.error ? (
              <ErrorState message={vault.error} onRetry={() => void vault.refresh()} />
            ) : null}

            {definitionsState.error ? (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                <p className="min-w-0 flex-1 text-foreground">
                  Service names could not be loaded. Your credentials are safe;
                  basic labels are shown for now.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </Button>
              </div>
            ) : null}

            {vault.loading ? (
              <LibrarySkeleton />
            ) : visibleItems.length === 0 ? (
              <EmptyState
                filtering={Boolean(query) || section !== "all"}
                shared={scopeKind === "shared"}
                onClear={() => {
                  setSearch("");
                  setSection("all");
                }}
                onCreate={() => setCreateOpen(true)}
                onShowMine={() => selectScope("mine")}
              />
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => {
                  const GroupIcon = group.definition.icon;
                  return (
                    <section key={group.definition.key}>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <GroupIcon className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">
                          {group.definition.label}
                        </h2>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {group.items.length}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        {group.items.map((item, index) => (
                          <CredentialRow
                            key={item.id}
                            item={item}
                            definition={definitionsByKey.get(item.definition_key)}
                            bordered={index > 0}
                            onOpen={() => setSelectedId(item.id)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <CredentialDetail
        item={selectedItem}
        definitions={definitionsByKey}
        busy={vault.busy}
        actions={vault.actions}
        onClose={() => setSelectedId(null)}
      />

      <VaultCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        principal={{ type: "user" }}
        definitions={definitionsState.definitions}
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
    </>
  );
}

function ScopeButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {count !== null ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
            active
              ? "bg-primary-foreground/15 text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SectionButton({
  definition,
  active,
  count,
  onClick,
}: {
  definition: SectionDefinition;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = definition.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      <span className="min-w-0 flex-1 text-xs font-medium leading-4">
        {definition.label}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function CredentialRow({
  item,
  definition,
  bordered,
  onOpen,
}: {
  item: VaultItem;
  definition: CredentialDefinition | undefined;
  bordered: boolean;
  onOpen: () => void;
}) {
  const identity = credentialIdentity(item, definition);
  const Icon = identity.icon;
  const primaryField = primarySecretFieldOf(item);
  const fieldLabel = primaryField
    ? fieldLabelOf(
        primaryField,
        definition?.payload.fields?.find(
          (field) => field.field_key === primaryField.field_key,
        )?.label,
      )
    : null;

  return (
    <article
      className={cn(
        "grid min-w-0 gap-3 p-3 transition-colors hover:bg-accent/30 sm:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)_2.5rem] sm:items-center",
        bordered && "border-t border-border",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${item.display_name}`}
        className="flex min-w-0 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn(IDENTITY_TILE_CLASS, "h-10 w-10")}>
          <Icon className={cn("h-5 w-5", identity.iconClass)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="whitespace-normal break-words text-sm font-semibold text-foreground">
              {item.display_name}
            </span>
            {item.status !== "active" ? (
              <Badge
                variant="outline"
                className="border-warning/40 font-normal capitalize text-warning"
              >
                {item.status.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </span>
          <span className="mt-1 block whitespace-normal break-words text-xs leading-5 text-muted-foreground">
            {[identity.kindLabel, identity.metaLine]
              .filter(Boolean)
              .join(" · ") || "Credential"}
          </span>
          {item.login_urls.length > 0 ? (
            <span className="mt-1 block whitespace-normal break-all text-xs text-muted-foreground">
              {item.login_urls.join(", ")}
            </span>
          ) : null}
        </span>
      </button>

      <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
        {primaryField ? (
          <>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              {fieldLabel ?? VAULT_LABELS.value}
            </p>
            <SecretValue
              item={item}
              field={primaryField}
              className="min-w-0"
            />
          </>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            Open to view files, notes, and access settings.
          </p>
        )}
      </div>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onOpen}
        aria-label={`Open ${item.display_name}`}
        className="h-10 w-10 justify-self-end"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </article>
  );
}

function CredentialDetail({
  item,
  definitions,
  busy,
  actions,
  onClose,
}: {
  item: VaultItem | null;
  definitions: Map<string, CredentialDefinition>;
  busy: boolean;
  actions: ReturnType<typeof useVault>["actions"];
  onClose: () => void;
}) {
  const identity = item
    ? credentialIdentity(item, definitions.get(item.definition_key))
    : null;
  const Icon = identity?.icon ?? KeyRound;

  return (
    <Credenza
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <CredenzaContent className="md:max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle className="flex min-w-0 items-start gap-3 pr-6 text-left">
            <span className={cn(IDENTITY_TILE_CLASS, "h-10 w-10")}>
              <Icon className={cn("h-5 w-5", identity?.iconClass)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal break-words text-base font-semibold text-foreground">
                {item?.display_name}
              </span>
              <span className="mt-1 block whitespace-normal break-words text-xs font-normal text-muted-foreground">
                {[identity?.kindLabel, identity?.metaLine]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[78dvh] overflow-y-auto overscroll-contain px-4 pb-safe md:px-0 md:pb-6">
          {item ? (
            <VaultItemDetail
              key={item.id}
              item={item}
              principal={{ type: "user" }}
              definitions={definitions}
              busy={busy}
              actions={actions}
              onClose={onClose}
            />
          ) : null}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          We could not load your credentials
        </p>
        <p className="mt-1 whitespace-normal break-words text-xs text-muted-foreground">
          {message}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function EmptyState({
  filtering,
  shared,
  onClear,
  onCreate,
  onShowMine,
}: {
  filtering: boolean;
  shared: boolean;
  onClear: () => void;
  onCreate: () => void;
  onShowMine: () => void;
}) {
  const title = filtering
    ? "Nothing matches this view"
    : shared
      ? "Nothing has been shared with you"
      : "Your credential library is ready";
  const description = filtering
    ? "Clear the search or show every credential type."
    : shared
      ? "Credentials another person shares with you will appear here."
      : "Add a website sign-in, API key, environment value, or secure file.";

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
      <span className={cn(IDENTITY_TILE_CLASS, "mx-auto h-12 w-12")}>
        {shared ? (
          <Share2 className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-primary" />
        )}
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        {filtering ? (
          <Button variant="outline" onClick={onClear}>
            Clear search and filters
          </Button>
        ) : shared ? (
          <Button variant="outline" onClick={onShowMine}>
            Show my credentials
          </Button>
        ) : (
          <Button onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add credential
          </Button>
        )}
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading credentials">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-card p-3"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="hidden h-8 w-48 rounded-md sm:block" />
          </div>
        </div>
      ))}
    </div>
  );
}
