"use client";

/**
 * VaultWorkspace — THE definition-driven credential vault UI for BOTH
 * principals (personal | organization). One list/search/create/detail
 * surface; organization-only controls appear via capabilities, never as
 * a second implementation. See features/secrets/FEATURE.md.
 */
import { useMemo, useState } from "react";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import { useVault, useVaultDefinitions } from "../vault-hooks";
import {
  FAMILY_LABELS,
  type CredentialDefinition,
  type CredentialFamily,
  type VaultItem,
  type VaultPrincipal,
} from "../types";
import { VaultCreateDialog } from "./VaultCreateDialog";
import { VaultEnvImportDialog } from "./VaultEnvImportDialog";
import { VaultItemDetail } from "./VaultItemDetail";

export interface VaultWorkspaceProps {
  principal: VaultPrincipal;
  /** Org-admin flag from the host (OrgManage `canManageSettings`). Ignored
   *  for the personal principal — owners always hold full capabilities. */
  canManage?: boolean;
}

export function VaultWorkspace({ principal, canManage }: VaultWorkspaceProps) {
  const orgAdmin = principal.type === "organization" ? Boolean(canManage) : true;
  const vault = useVault(principal, { orgAdmin });
  const { definitions } = useVaultDefinitions();

  const defsByKey = useMemo(
    () => new Map(definitions.map((d) => [d.key, d])),
    [definitions],
  );

  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<"all" | CredentialFamily>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const familiesPresent = useMemo(() => {
    const present = new Set<CredentialFamily>();
    for (const item of vault.items) {
      const fam = familyOf(item, defsByKey);
      if (fam) present.add(fam);
    }
    return [...present].sort();
  }, [vault.items, defsByKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vault.items.filter((item) => {
      if (family !== "all" && familyOf(item, defsByKey) !== family) return false;
      if (!query) return true;
      const def = defsByKey.get(item.definition_key);
      const haystack = [
        item.display_name,
        item.description ?? "",
        item.definition_key,
        item.provider_key ?? "",
        def?.payload.label ?? "",
        ...item.tags,
        ...item.fields.map((f) => `${f.field_key} ${f.env_key ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [vault.items, search, family, defsByKey]);

  const selected = selectedId
    ? (vault.items.find((i) => i.id === selectedId) ?? null)
    : null;

  return (
    <div className="space-y-3">
      {principal.type === "organization" && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Members can use organization credentials without revealing them.
            </span>{" "}
            Values are encrypted at rest and only resolved inside trusted
            server operations. Admins manage access, rotation, and deletion.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search credentials"
            className="pl-8"
            aria-label="Search credentials"
          />
        </div>
        {familiesPresent.length > 1 && (
          <Select
            value={family}
            onValueChange={(next) => setFamily(next as "all" | CredentialFamily)}
          >
            <SelectTrigger className="w-auto min-w-36" aria-label="Filter by family">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All families</SelectItem>
              {familiesPresent.map((fam) => (
                <SelectItem key={fam} value={fam}>
                  {FAMILY_LABELS[fam]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {orgAdmin && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              disabled={vault.busy}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import .env
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={vault.busy}>
              <Plus className="mr-2 h-4 w-4" />
              New credential
            </Button>
          </>
        )}
      </div>

      {vault.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {vault.error}
        </div>
      )}

      {/* List */}
      {vault.loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading vault…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <KeyRound className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {vault.items.length === 0 ? "No credentials yet" : "No matches"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {vault.items.length === 0
              ? orgAdmin
                ? "Create one from the catalog or import a .env file."
                : "An organization admin can add shared credentials here."
              : "Adjust the search or family filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <VaultItemCard
              key={item.id}
              item={item}
              definition={defsByKey.get(item.definition_key)}
              onOpen={() => setSelectedId(item.id)}
            />
          ))}
        </div>
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
            <CredenzaTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {selected?.display_name}
            </CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody className="max-h-[70dvh] overflow-y-auto pb-6">
            {selected && (
              <VaultItemDetail
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

function VaultItemCard({
  item,
  definition,
  onOpen,
}: {
  item: VaultItem;
  definition: CredentialDefinition | undefined;
  onOpen: () => void;
}) {
  const typeLabel = definition?.payload.label ?? item.definition_key;
  const firstHints = item.fields.slice(0, 2);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-w-0 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
          {item.display_name}
        </p>
        {item.status !== "active" && (
          <Badge variant="outline" className="shrink-0 capitalize">
            {item.status.replaceAll("_", " ")}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="max-w-full truncate font-normal">
          {typeLabel}
        </Badge>
        {item.provider_key && (
          <Badge variant="outline" className="max-w-full truncate font-normal">
            {item.provider_key}
          </Badge>
        )}
        {item.organization_id && item.access_mode === "restricted" && (
          <Badge variant="outline" className="font-normal">
            Restricted
          </Badge>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        {firstHints.map((field) => (
          <p
            key={field.id}
            className="truncate font-mono text-xs text-muted-foreground"
          >
            {field.env_key ?? field.field_key} · {field.value_hint || "•••"}
          </p>
        ))}
        {item.fields.length > 2 && (
          <p className="text-xs text-muted-foreground">
            +{item.fields.length - 2} more field
            {item.fields.length - 2 === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </button>
  );
}
