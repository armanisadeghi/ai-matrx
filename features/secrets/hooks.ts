/**
 * Hooks for the secrets vault.
 *
 * One hook per concern, all colocated. The list hook is the workhorse;
 * mutate-hooks return imperative functions you call inline (no auto-
 * dispatching effects, because secret-writes are explicit user gestures).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  bulkImportEnv,
  createSecret,
  deleteSecret,
  fetchSecrets,
  updateSecret,
} from "./service";
import type {
  UserSecretBulkEnvRequest,
  UserSecretCreateRequest,
  UserSecretSummary,
  UserSecretUpdateRequest,
} from "./types";

export function useSecrets(opts?: { includeInactive?: boolean }) {
  const [secrets, setSecrets] = useState<UserSecretSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSecrets({
        includeInactive: opts?.includeInactive,
      });
      setSecrets(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [opts?.includeInactive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { secrets, loading, error, refresh, setSecrets };
}

export function useCreateSecret(onAfter?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (body: UserSecretCreateRequest) => {
      setBusy(true);
      try {
        const row = await createSecret(body);
        toast.success(`Saved ${row.key}`);
        onAfter?.();
        return row;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Failed to save secret: ${msg}`);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [onAfter],
  );
  return { run, busy };
}

export function useUpdateSecret(onAfter?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (key: string, body: UserSecretUpdateRequest) => {
      setBusy(true);
      try {
        const row = await updateSecret(key, body);
        toast.success(`Updated ${row.key}`);
        onAfter?.();
        return row;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Failed to update secret: ${msg}`);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [onAfter],
  );
  return { run, busy };
}

export function useDeleteSecret(onAfter?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (key: string) => {
      setBusy(true);
      try {
        await deleteSecret(key);
        toast.success(`Deleted ${key}`);
        onAfter?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Failed to delete: ${msg}`);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [onAfter],
  );
  return { run, busy };
}

export function useBulkImportEnv(onAfter?: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (body: UserSecretBulkEnvRequest) => {
      setBusy(true);
      try {
        const resp = await bulkImportEnv(body);
        toast.success(
          resp.count > 0
            ? `Imported ${resp.count} secret${resp.count === 1 ? "" : "s"}`
            : "No valid KEY=value lines found in the input",
        );
        onAfter?.();
        return resp;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Bulk import failed: ${msg}`);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [onAfter],
  );
  return { run, busy };
}
