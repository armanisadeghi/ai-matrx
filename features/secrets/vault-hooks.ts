/**
 * Unified Credential Vault — ONE hook set for both principals.
 *
 * Replaces the deleted `hooks.ts` / `organization-hooks.ts` pair. All
 * mutations funnel through `useVault().actions` so busy-state, toasts,
 * and refresh behave identically on every surface.
 *
 * Revealed plaintext lives ONLY in `useTransientSecret` component state
 * with an auto-clear timeout — never Redux, storage, or query caches.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import {
  addVaultField,
  createVaultItem,
  deleteVaultField,
  deleteVaultItem,
  fetchCredentialDefinitions,
  fetchVaultAudit,
  fetchVaultItems,
  forkVaultItem,
  importVaultEnv,
  rotateVaultItem,
  setFieldInjectFlag,
  shareVaultItem,
  transferVaultItem,
  updateVaultFieldValue,
  updateVaultItem,
} from "./vault-service";
import type {
  CredentialDefinition,
  VaultAccessMode,
  VaultAuditEntry,
  VaultFieldIn,
  VaultItem,
  VaultItemCreateRequest,
  VaultItemUpdateRequest,
  VaultPrincipal,
} from "./types";

// ── Catalog definitions ───────────────────────────────────────────────────

export function useVaultDefinitions() {
  const [definitions, setDefinitions] = useState<CredentialDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchCredentialDefinitions()
      .then((defs) => {
        if (!active) return;
        setDefinitions(defs);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { definitions, loading, error };
}

// ── The workhorse: list + all mutations for one viewed principal ──────────

export interface VaultActions {
  createItem: (body: VaultItemCreateRequest) => Promise<VaultItem>;
  importEnv: (envText: string, inject: boolean) => Promise<number>;
  updateItem: (itemId: string, body: VaultItemUpdateRequest) => Promise<VaultItem>;
  deleteItem: (itemId: string) => Promise<void>;
  addField: (itemId: string, field: VaultFieldIn) => Promise<void>;
  updateFieldValue: (itemId: string, fieldId: string, value: string) => Promise<void>;
  deleteField: (itemId: string, fieldId: string) => Promise<void>;
  setInject: (fieldId: string, inject: boolean) => Promise<void>;
  rotate: (itemId: string, values: Record<string, string>) => Promise<void>;
  share: (
    itemId: string,
    accessMode: VaultAccessMode,
    userIds: string[],
  ) => Promise<void>;
  transfer: (itemId: string, to: VaultPrincipal) => Promise<void>;
  fork: (itemId: string, to: VaultPrincipal) => Promise<void>;
}

export function useVault(
  principal: VaultPrincipal,
  opts?: { orgAdmin?: boolean },
) {
  const orgAdmin = opts?.orgAdmin ?? false;
  const organizationId =
    principal.type === "organization" ? principal.organizationId : null;

  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-mutation refresh (event-handler-invoked, so sync setState is fine).
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchVaultItems(
        organizationId
          ? { type: "organization", organizationId }
          : { type: "user" },
        { orgAdmin },
      );
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [organizationId, orgAdmin]);

  // Initial load — setState only inside async callbacks (lint doctrine).
  useEffect(() => {
    let active = true;
    fetchVaultItems(
      organizationId
        ? { type: "organization", organizationId }
        : { type: "user" },
      { orgAdmin },
    )
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, orgAdmin]);

  const run = useCallback(
    async <T,>(success: string | null, op: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const result = await op();
        if (success) toast.success(success);
        await refresh();
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const actions: VaultActions = {
    createItem: (body) =>
      run(`Saved ${body.display_name}`, () => createVaultItem(body)),
    importEnv: (envText, inject) =>
      run(null, async () => {
        const resp = await importVaultEnv({
          principal:
            principal.type === "organization"
              ? { type: "organization", organization_id: principal.organizationId }
              : { type: "user" },
          env_text: envText,
          inject_into_sandbox: inject,
        });
        toast.success(
          resp.count > 0
            ? `Imported ${resp.count} credential${resp.count === 1 ? "" : "s"}`
            : "No valid KEY=value lines found in the input",
        );
        return resp.count;
      }),
    updateItem: (itemId, body) =>
      run("Credential updated", () => updateVaultItem(itemId, body)),
    deleteItem: (itemId) =>
      run("Credential deleted", () => deleteVaultItem(itemId)),
    addField: (itemId, field) =>
      run(`Added field ${field.field_key}`, async () => {
        await addVaultField(itemId, field);
      }),
    updateFieldValue: (itemId, fieldId, value) =>
      run("Value updated", async () => {
        await updateVaultFieldValue(itemId, fieldId, value);
      }),
    deleteField: (itemId, fieldId) =>
      run("Field deleted", async () => {
        await deleteVaultField(itemId, fieldId);
      }),
    setInject: (fieldId, inject) =>
      run(
        inject ? "Sandbox injection enabled" : "Sandbox injection disabled",
        () => setFieldInjectFlag(fieldId, inject),
      ),
    rotate: (itemId, values) =>
      run("Credential rotated", async () => {
        await rotateVaultItem(itemId, values);
      }),
    share: (itemId, accessMode, userIds) =>
      run("Access updated", async () => {
        await shareVaultItem(itemId, accessMode, userIds);
      }),
    transfer: (itemId, to) =>
      run(
        to.type === "organization"
          ? "Transferred to the organization"
          : "Transferred to your personal vault",
        async () => {
          await transferVaultItem(itemId, to);
        },
      ),
    fork: (itemId, to) =>
      run("Independent copy created", async () => {
        await forkVaultItem(itemId, to);
      }),
  };

  return { items, loading, busy, error, refresh, actions };
}

// ── Audit trail (via aidream — the audit table has no client RLS read) ────

export function useVaultAudit(itemId: string) {
  const [entries, setEntries] = useState<VaultAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchVaultAudit(itemId)
      .then((rows) => {
        if (!active) return;
        setEntries(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [itemId]);

  return { entries, loading, error };
}

// ── Transient plaintext holder (reveal/resolve) ───────────────────────────

const REVEAL_CLEAR_MS = 30_000;

/**
 * Holds ONE revealed value in component-local state and auto-clears it
 * after ~30s. The value must never be copied into Redux, storage, URLs,
 * or any cache.
 */
export function useTransientSecret(clearAfterMs: number = REVEAL_CLEAR_MS) {
  const [value, setValue] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setValue(null);
  }, []);

  const hold = useCallback(
    (plaintext: string) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(plaintext);
      timer.current = setTimeout(() => {
        timer.current = null;
        setValue(null);
      }, clearAfterMs);
    },
    [clearAfterMs],
  );

  useEffect(() => clear, [clear]);

  return { value, hold, clear };
}
