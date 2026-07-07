"use client";

// Sharing Policy — Super Admin only.
//
// Control panel for the no-login share-link policy across every shareable
// resource type. The (admin) layout already requires Super Admin; the two
// backing RPCs (`admin_list_share_policies` / `admin_set_share_policy`) also
// re-check `is_super_admin()` in the database and raise 42501 otherwise, so a
// contributor who reaches this page without the DB grant sees a clean gate.
//
// Two levers per resource type:
//   - is_link_shareable — whether this type offers a no-login "Anyone with the
//     link" panel AND whether existing tokens resolve. A per-type on/off.
//   - public_columns    — the default-deny ALLOWLIST of columns exposed to
//     anonymous viewers when a link is opened. NULL/empty means the link
//     resolves but shows no content. These columns become visible to ANYONE
//     with the link, so the picker never pre-checks and loudly flags
//     secret-looking columns.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Columns3,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

interface SharePolicyRow {
  resource_type: string;
  schema_name: string;
  table_name: string;
  display_label: string;
  is_active: boolean;
  rls_uses_has_permission: boolean;
  is_link_shareable: boolean;
  public_columns: string[] | null;
  supports_public: boolean;
  all_columns: string[];
}

// Substrings that make a column dangerous to expose to anonymous viewers.
// Used ONLY to flag columns visually — never to pre-select anything.
const SECRET_HINTS = [
  "secret",
  "token",
  "password",
  "passwd",
  "api_key",
  "apikey",
  "private",
  "salt",
  "hash",
  "storage_uri",
  "storage",
  "s3",
  "signed",
  "credential",
  "auth",
  "email",
  "phone",
  "ssn",
  "address",
  "ip_address",
  "user_id",
  "owner_id",
  "created_by",
];

// Exact column names that are sensitive but don't match a substring hint —
// the "secret sauce" columns the seeded allowlists deliberately exclude
// (agent prompt/config, app source, chat instructions, quiz answer key, …).
const SECRET_EXACT = new Set([
  "messages",
  "system_instruction",
  "config",
  "variables",
  "overrides",
  "settings",
  "tools",
  "custom_tools",
  "tool_config",
  "mcp_servers",
  "skill_config",
  "component_code",
  "slot_code",
  "state",
  "ciphertext",
  "nonce",
  "webhook_secret",
  "input",
  "output",
]);

function isSecretLookingColumn(name: string): boolean {
  const n = name.toLowerCase();
  if (SECRET_EXACT.has(n)) return true;
  return SECRET_HINTS.some((hint) => n.includes(hint));
}

function policyKey(row: SharePolicyRow): string {
  return row.resource_type;
}

// Sort: link-shareable first, then active, then supports_public, then label.
function sortPolicies(rows: SharePolicyRow[]): SharePolicyRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_link_shareable !== b.is_link_shareable)
      return a.is_link_shareable ? -1 : 1;
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.supports_public !== b.supports_public)
      return a.supports_public ? -1 : 1;
    return a.display_label.localeCompare(b.display_label);
  });
}

export default function SharingPolicyPage() {
  const [rows, setRows] = useState<SharePolicyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  // Draft column selection for the currently expanded row (keyed by resource_type).
  const [draftColumns, setDraftColumns] = useState<Record<string, Set<string>>>(
    {},
  );

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_share_policies",
      );
      if (rpcError) {
        // 42501 = insufficient_privilege → the DB gate rejected us.
        if (
          rpcError.code === "42501" ||
          /super admin|insufficient|permission denied/i.test(
            rpcError.message ?? "",
          )
        ) {
          setDenied(true);
          setRows([]);
          return;
        }
        throw new Error(rpcError.message || "Failed to load share policies");
      }
      setDenied(false);
      setError(null);
      // Normalize: the RPC returns all_columns = null for inactive rows whose
      // physical table is gone (deactivated types). Guarantee arrays so the
      // render never dereferences null.
      const normalized = ((data as SharePolicyRow[]) ?? []).map((r) => ({
        ...r,
        all_columns: r.all_columns ?? [],
        public_columns: r.public_columns ?? null,
      }));
      setRows(sortPolicies(normalized));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load share policies");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setBusy = (key: string, busy: boolean) =>
    setRowBusy((s) => ({ ...s, [key]: busy }));

  // Persist a policy change and refresh from the source of truth.
  const persist = useCallback(
    async (
      row: SharePolicyRow,
      isLinkShareable: boolean,
      columns: string[],
    ): Promise<boolean> => {
      const key = policyKey(row);
      setBusy(key, true);
      try {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc(
          "admin_set_share_policy",
          {
            p_resource_type: row.resource_type,
            p_is_link_shareable: isLinkShareable,
            p_public_columns: columns,
          },
        );
        if (rpcError) {
          if (
            rpcError.code === "42501" ||
            /super admin|insufficient|permission denied/i.test(
              rpcError.message ?? "",
            )
          ) {
            toast.error("Super Admin required to change share policy.");
            setDenied(true);
            return false;
          }
          toast.error(`Update failed: ${rpcError.message}`);
          return false;
        }
        await load();
        return true;
      } finally {
        setBusy(key, false);
      }
    },
    [load],
  );

  const toggleLinkShareable = useCallback(
    async (row: SharePolicyRow, next: boolean) => {
      const columns = row.public_columns ?? [];
      if (next) {
        const ok = await confirm({
          title: `Enable no-login link sharing for “${row.display_label}”?`,
          description:
            columns.length > 0
              ? `Existing and new share links for this type will resolve for anyone — no login. ${columns.length} column(s) are currently in the public allowlist and will be visible to anonymous viewers.`
              : "Existing and new share links for this type will resolve for anyone — no login. No columns are in the public allowlist yet, so links resolve but show no content until you expose columns below.",
          confirmLabel: "Enable link sharing",
          variant: "destructive",
        });
        if (!ok) return;
      }
      const ok = await persist(row, next, columns);
      if (ok)
        toast.success(
          next
            ? `Link sharing enabled for ${row.display_label}.`
            : `Link sharing disabled for ${row.display_label}.`,
        );
    },
    [persist],
  );

  const startEditing = (row: SharePolicyRow) => {
    const key = policyKey(row);
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setDraftColumns((s) => ({
      ...s,
      [key]: new Set(row.public_columns ?? []),
    }));
    setExpanded(key);
  };

  const toggleDraftColumn = (row: SharePolicyRow, column: string) => {
    const key = policyKey(row);
    setDraftColumns((s) => {
      const current = new Set(s[key] ?? row.public_columns ?? []);
      if (current.has(column)) current.delete(column);
      else current.add(column);
      return { ...s, [key]: current };
    });
  };

  const saveColumns = useCallback(
    async (row: SharePolicyRow) => {
      const key = policyKey(row);
      const draft = draftColumns[key] ?? new Set(row.public_columns ?? []);
      const selected = (row.all_columns ?? []).filter((c) => draft.has(c));
      const previous = new Set(row.public_columns ?? []);
      const added = selected.filter((c) => !previous.has(c));
      const newlyExposedSecrets = added.filter(isSecretLookingColumn);

      if (added.length > 0) {
        const ok = await confirm({
          title: `Expose ${added.length} column(s) on “${row.display_label}”?`,
          description:
            newlyExposedSecrets.length > 0
              ? `You are adding ${added.join(", ")}. ${newlyExposedSecrets.length} of these look sensitive (${newlyExposedSecrets.join(", ")}). Anyone with a share link will be able to read them. Continue?`
              : `You are adding: ${added.join(", ")}. Anyone with a share link will be able to read these columns.`,
          confirmLabel: "Expose columns",
          variant: "destructive",
        });
        if (!ok) return;
      }

      const ok = await persist(row, row.is_link_shareable, selected);
      if (ok) {
        toast.success(`Public columns updated for ${row.display_label}.`);
        setExpanded(null);
      }
    },
    [draftColumns, persist],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.resource_type.toLowerCase().includes(q) ||
        r.display_label.toLowerCase().includes(q) ||
        r.schema_name.toLowerCase().includes(q) ||
        r.table_name.toLowerCase().includes(q) ||
        `${r.schema_name}.${r.table_name}`.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const stats = useMemo(() => {
    if (!rows) return { total: 0, shareable: 0, publicCapable: 0 };
    return {
      total: rows.length,
      shareable: rows.filter((r) => r.is_link_shareable).length,
      publicCapable: rows.filter((r) => r.supports_public).length,
    };
  }, [rows]);

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Link2 className="h-6 w-6 text-sky-500" />
              Sharing Policy
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control the no-login share-link policy for every shareable
              resource type. <strong>Link sharing</strong> decides whether a
              type offers an &ldquo;Anyone with the link&rdquo; panel and whether
              existing tokens resolve. <strong>Public columns</strong> are the
              default-deny allowlist an anonymous viewer sees when a link is
              opened.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Columns3 className="h-4 w-4" /> {stats.total} types
            </span>
            <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
              <Link2 className="h-4 w-4" /> {stats.shareable} link-shareable
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" /> {stats.publicCapable} public-capable
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={rows === null}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </header>

        {denied ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-semibold text-foreground">
              Super Admin required
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              The share-policy controls are gated at the database. Your account
              does not have Super Admin, so these policies cannot be viewed or
              changed here.
            </p>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> Failed to load share policies
            </div>
            <p className="mb-3">{error}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : (
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by resource type, label, or schema.table"
                  className="pl-8"
                />
              </div>
            </div>

            {rows === null ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading share
                policies…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No resource types match your search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Resource type</th>
                      <th className="px-4 py-2 font-medium">Physical table</th>
                      <th className="px-4 py-2 font-medium">Flags</th>
                      <th className="px-4 py-2 font-medium">Public columns</th>
                      <th className="px-4 py-2 font-medium text-center">
                        Link sharing
                      </th>
                      <th className="px-4 py-2 font-medium text-right">
                        Columns
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const key = policyKey(row);
                      const busy = !!rowBusy[key];
                      const isOpen = expanded === key;
                      const publicCount = (row.public_columns ?? []).length;
                      const totalCount = (row.all_columns ?? []).length;
                      const draft =
                        draftColumns[key] ?? new Set(row.public_columns ?? []);
                      return (
                        <FragmentRow key={key}>
                          <tr className="border-b border-border/60 hover:bg-accent/40">
                            <td className="px-4 py-2.5 align-top">
                              <div className="font-medium text-foreground">
                                {row.display_label}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {row.resource_type}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <span className="font-mono text-xs text-muted-foreground">
                                {row.schema_name}.{row.table_name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <div className="flex flex-wrap gap-1">
                                <Flag
                                  on={row.is_active}
                                  onLabel="active"
                                  offLabel="inactive"
                                />
                                <Flag
                                  on={row.rls_uses_has_permission}
                                  onLabel="rls_grants"
                                  offLabel="no rls_grants"
                                />
                                <Flag
                                  on={row.supports_public}
                                  onLabel="supports_public"
                                  offLabel="no public"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <button
                                type="button"
                                onClick={() => startEditing(row)}
                                className="flex items-center gap-1.5 text-left"
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span
                                  className={
                                    publicCount > 0
                                      ? "text-foreground"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {publicCount} of {totalCount} columns
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-center align-top">
                              <div className="flex items-center justify-center gap-2">
                                {busy && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                )}
                                <Switch
                                  checked={row.is_link_shareable}
                                  disabled={busy}
                                  onCheckedChange={(next) =>
                                    void toggleLinkShareable(row, next)
                                  }
                                  aria-label={`Toggle link sharing for ${row.display_label}`}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right align-top">
                              <Button
                                size="sm"
                                variant={isOpen ? "default" : "outline"}
                                onClick={() => startEditing(row)}
                              >
                                <Columns3 className="h-3.5 w-3.5" />
                                {isOpen ? "Close" : "Edit"}
                              </Button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-b border-border bg-muted/30">
                              <td colSpan={6} className="px-4 py-4">
                                <ColumnEditor
                                  row={row}
                                  draft={draft}
                                  busy={busy}
                                  onToggleColumn={(c) =>
                                    toggleDraftColumn(row, c)
                                  }
                                  onSave={() => void saveColumns(row)}
                                  onCancel={() => setExpanded(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </FragmentRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// Small helper so a row + its expansion can share one key without an extra DOM node.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Flag({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return on ? (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
      {onLabel}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {offLabel}
    </span>
  );
}

function ColumnEditor({
  row,
  draft,
  busy,
  onToggleColumn,
  onSave,
  onCancel,
}: {
  row: SharePolicyRow;
  draft: Set<string>;
  busy: boolean;
  onToggleColumn: (column: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const previous = new Set(row.public_columns ?? []);
  const selectedCount = (row.all_columns ?? []).filter((c) => draft.has(c)).length;
  const dirty = useMemo(() => {
    if (draft.size !== previous.size) return true;
    for (const c of draft) if (!previous.has(c)) return true;
    return false;
  }, [draft, previous]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Checked columns are visible to <strong>anyone with the link</strong> —
          never expose secrets, PII, or storage locations. Columns that look
          sensitive are flagged with a lock. Default is deny: only what you check
          is exposed.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {(row.all_columns ?? []).map((column) => {
          const checked = draft.has(column);
          const secretLooking = isSecretLookingColumn(column);
          return (
            <label
              key={column}
              className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/40 cursor-pointer"
            >
              <Checkbox
                checked={checked}
                disabled={busy}
                onCheckedChange={() => onToggleColumn(column)}
              />
              <span
                className={`flex items-center gap-1 font-mono text-xs ${
                  checked && secretLooking
                    ? "font-semibold text-red-600 dark:text-red-400"
                    : secretLooking
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                }`}
                title={
                  secretLooking
                    ? "Looks sensitive — avoid exposing to anonymous viewers"
                    : undefined
                }
              >
                {secretLooking && <Lock className="h-3 w-3 shrink-0" />}
                {column}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {(row.all_columns ?? []).length} columns selected
          {dirty && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              (unsaved)
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={busy || !dirty}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save exposed columns
          </Button>
        </div>
      </div>
    </div>
  );
}
