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
  addVaultAttachment,
  addVaultField,
  addVaultGrant,
  assignVaultItem,
  createVaultItem,
  deleteVaultAttachment,
  deleteVaultField,
  deleteVaultItem,
  downloadVaultAttachment,
  fetchCredentialDefinitions,
  fetchVaultAudit,
  fetchVaultGrants,
  fetchVaultItems,
  forkVaultItem,
  giveVaultItemOwnership,
  importVaultEnv,
  removeVaultGrant,
  replaceVaultAttachment,
  rotateVaultItem,
  setVaultAccessMode,
  transferVaultItem,
  updateVaultAttachment,
  updateVaultFieldMetadata,
  updateVaultFieldValue,
  updateVaultGrant,
  updateVaultItem,
} from "./vault-service";
import { toPrincipalIn } from "./types";
import type {
  CredentialDefinition,
  VaultAccessMode,
  VaultAttachmentUpdateRequest,
  VaultAssignRequest,
  VaultAssignResponse,
  VaultAuditEntry,
  VaultFieldIn,
  VaultFieldMetadataRequest,
  VaultGrant,
  VaultItem,
  VaultItemCreateRequest,
  VaultItemUpdateRequest,
  VaultPrincipal,
  VaultScope,
  VaultTransferResponse,
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
  createItemWithAttachments: (
    body: VaultItemCreateRequest,
    attachments: {
      file: File;
      label: string;
      description?: string;
      handling: string;
    }[],
  ) => Promise<VaultItem>;
  importEnv: (envText: string, inject: boolean) => Promise<number>;
  updateItem: (
    itemId: string,
    body: VaultItemUpdateRequest,
  ) => Promise<VaultItem>;
  deleteItem: (itemId: string) => Promise<void>;
  addAttachment: (
    itemId: string,
    file: File,
    metadata: { label: string; description?: string; handling: string },
  ) => Promise<void>;
  updateAttachment: (
    itemId: string,
    attachmentId: string,
    body: VaultAttachmentUpdateRequest,
  ) => Promise<void>;
  replaceAttachment: (
    itemId: string,
    attachmentId: string,
    file: File,
  ) => Promise<void>;
  deleteAttachment: (itemId: string, attachmentId: string) => Promise<void>;
  downloadAttachment: (
    itemId: string,
    attachmentId: string,
    fileName: string,
  ) => Promise<void>;
  addField: (itemId: string, field: VaultFieldIn) => Promise<void>;
  updateFieldValue: (
    itemId: string,
    fieldId: string,
    value: string,
  ) => Promise<void>;
  deleteField: (itemId: string, fieldId: string) => Promise<void>;
  setInject: (
    itemId: string,
    fieldId: string,
    inject: boolean,
  ) => Promise<void>;
  updateFieldMeta: (
    itemId: string,
    fieldId: string,
    body: VaultFieldMetadataRequest,
  ) => Promise<void>;
  rotate: (itemId: string, values: Record<string, string>) => Promise<void>;
  /** Organization access-mode flip only — personal sharing uses the grant ops. */
  setAccessMode: (itemId: string, accessMode: VaultAccessMode) => Promise<void>;
  addGrant: (
    itemId: string,
    body: { recipient_email: string; can_use?: boolean; can_manage?: boolean },
  ) => Promise<VaultGrant>;
  updateGrant: (
    itemId: string,
    grantId: string,
    body: { can_use?: boolean; can_manage?: boolean },
  ) => Promise<VaultGrant>;
  removeGrant: (itemId: string, grantId: string) => Promise<void>;
  /** Hand the item to ANOTHER user — the sender loses all access. */
  giveOwnership: (
    itemId: string,
    recipientEmail: string,
  ) => Promise<VaultTransferResponse>;
  /** Create an item already owned by someone else. */
  assign: (body: VaultAssignRequest) => Promise<VaultAssignResponse>;
  transfer: (itemId: string, to: VaultPrincipal) => Promise<void>;
  fork: (itemId: string, to: VaultPrincipal) => Promise<void>;
}

export function useVault(scope: VaultScope, opts?: { orgAdmin?: boolean }) {
  const orgAdmin = opts?.orgAdmin ?? false;
  // Primitive deps so the effect doesn't re-run on every object identity.
  const scopeKind = scope.kind;
  const organizationId =
    scope.kind === "organization" ? scope.organizationId : null;
  // The principal a create/import writes to. "Shared with me" owns nothing.
  const principal: VaultPrincipal | null = organizationId
    ? { type: "organization", organizationId }
    : scopeKind === "mine"
      ? { type: "user" }
      : null;

  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentScope = useCallback((): VaultScope => {
    if (organizationId) return { kind: "organization", organizationId };
    return scopeKind === "shared" ? { kind: "shared" } : { kind: "mine" };
  }, [organizationId, scopeKind]);

  // Post-mutation refresh (event-handler-invoked, so sync setState is fine).
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchVaultItems(currentScope(), { orgAdmin });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [currentScope, orgAdmin]);

  // Initial load — setState only inside async callbacks (lint doctrine).
  useEffect(() => {
    let active = true;
    fetchVaultItems(currentScope(), { orgAdmin })
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
  }, [currentScope, orgAdmin]);

  const run = useCallback(
    async <T>(success: string | null, op: () => Promise<T>): Promise<T> => {
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
    createItemWithAttachments: (body, attachments) =>
      run(`Saved ${body.display_name}`, async () => {
        const item = await createVaultItem(body);
        try {
          for (const attachment of attachments) {
            await addVaultAttachment(item.id, attachment.file, attachment);
          }
        } catch (uploadError) {
          try {
            await deleteVaultItem(item.id);
          } catch (cleanupError) {
            const cleanupMessage =
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError);
            throw new Error(
              `The file upload failed and the empty credential could not be removed: ${cleanupMessage}`,
              { cause: uploadError },
            );
          }
          throw uploadError;
        }
        return item;
      }),
    importEnv: (envText, inject) =>
      run(null, async () => {
        if (!principal) {
          throw new Error(
            "Choose Mine or an organization before importing — items shared with you are owned by someone else",
          );
        }
        const resp = await importVaultEnv({
          principal: toPrincipalIn(principal),
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
    addAttachment: (itemId, file, metadata) =>
      run(`Added ${file.name}`, async () => {
        await addVaultAttachment(itemId, file, metadata);
      }),
    updateAttachment: (itemId, attachmentId, body) =>
      run("File details updated", async () => {
        await updateVaultAttachment(itemId, attachmentId, body);
      }),
    replaceAttachment: (itemId, attachmentId, file) =>
      run(`Replaced with ${file.name}`, async () => {
        await replaceVaultAttachment(itemId, attachmentId, file);
      }),
    deleteAttachment: (itemId, attachmentId) =>
      run("File deleted", async () => {
        await deleteVaultAttachment(itemId, attachmentId);
      }),
    downloadAttachment: (itemId, attachmentId, fileName) =>
      run(null, () => downloadVaultAttachment(itemId, attachmentId, fileName)),
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
    setInject: (itemId, fieldId, inject) =>
      run(
        inject ? "Sandbox injection enabled" : "Sandbox injection disabled",
        async () => {
          await updateVaultFieldMetadata(itemId, fieldId, {
            inject_into_sandbox: inject,
          });
        },
      ),
    updateFieldMeta: (itemId, fieldId, body) =>
      run("Field updated", async () => {
        await updateVaultFieldMetadata(itemId, fieldId, body);
      }),
    rotate: (itemId, values) =>
      run("Credential rotated", async () => {
        await rotateVaultItem(itemId, values);
      }),
    setAccessMode: (itemId, accessMode) =>
      run("Access updated", async () => {
        await setVaultAccessMode(itemId, accessMode);
      }),
    addGrant: (itemId, body) =>
      run(`Shared with ${body.recipient_email}`, () =>
        addVaultGrant(itemId, body),
      ),
    updateGrant: (itemId, grantId, body) =>
      run("Access updated", () => updateVaultGrant(itemId, grantId, body)),
    removeGrant: (itemId, grantId) =>
      run("Access revoked", async () => {
        await removeVaultGrant(itemId, grantId);
      }),
    giveOwnership: (itemId, recipientEmail) =>
      run(`Ownership given to ${recipientEmail}`, () =>
        giveVaultItemOwnership(itemId, recipientEmail),
      ),
    assign: (body) =>
      run(`Created for ${body.recipient_email}`, () => assignVaultItem(body)),
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

// ── Grants (via aidream — the access list is owner information) ───────────

/**
 * The item's CURRENT recipients, loaded before the share UI renders.
 *
 * This load is the whole point: the old panel initialized empty and saved a
 * replacement set, so opening Share and pressing Save silently revoked every
 * recipient it had never seen.
 */
export function useVaultGrants(itemId: string, enabled = true) {
  const [grants, setGrants] = useState<VaultGrant[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setGrants(await fetchVaultGrants(itemId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [itemId, enabled]);

  // setState only inside async callbacks (lint doctrine: no sync setState in
  // an effect). The disabled case resolves immediately rather than branching
  // before the async boundary.
  useEffect(() => {
    let active = true;
    const load = enabled
      ? fetchVaultGrants(itemId)
      : Promise.resolve<VaultGrant[]>([]);
    load
      .then((rows) => {
        if (!active) return;
        setGrants(rows);
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
  }, [itemId, enabled]);

  return { grants, loading, error, reload };
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
  // When the auto-clear fires. A timestamp is NOT the secret, so surfacing it
  // is safe — and showing the user that a revealed value hides itself is the
  // difference between the rule feeling like a guarantee and a surprise.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setValue(null);
    setExpiresAt(null);
  }, []);

  const hold = useCallback(
    (plaintext: string) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(plaintext);
      setExpiresAt(Date.now() + clearAfterMs);
      timer.current = setTimeout(() => {
        timer.current = null;
        setValue(null);
        setExpiresAt(null);
      }, clearAfterMs);
    },
    [clearAfterMs],
  );

  useEffect(() => clear, [clear]);

  return { value, hold, clear, expiresAt };
}
