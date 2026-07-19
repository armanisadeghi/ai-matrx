"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  contributeOrganizationSecret,
  createOrganizationSecret,
  deleteOrganizationSecret,
  fetchOrganizationSecrets,
  setOrganizationSecretPermissions,
  syncOrganizationSecret,
  updateOrganizationSecret,
} from "@/features/secrets/organization-service";
import type {
  OrganizationSecretContributeRequest,
  OrganizationSecretCreateRequest,
  OrganizationSecretPermissionsRequest,
  OrganizationSecretSummary,
  OrganizationSecretUpdateRequest,
} from "@/features/secrets/types";

export function useOrganizationVault(organizationId: string) {
  const [secrets, setSecrets] = useState<OrganizationSecretSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setSecrets(await fetchOrganizationSecrets(organizationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organization vault");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void fetchOrganizationSecrets(organizationId)
      .then((rows) => {
        if (!active) return;
        setSecrets(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load organization vault");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  const run = async <T,>(success: string, operation: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      const result = await operation();
      toast.success(success);
      await refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return {
    secrets,
    loading,
    busy,
    error,
    refresh,
    create: (body: OrganizationSecretCreateRequest) =>
      run(`Saved ${body.key} for the organization`, () =>
        createOrganizationSecret(organizationId, body),
      ),
    contribute: (body: OrganizationSecretContributeRequest) =>
      run("Copied your secret into the organization vault", () =>
        contributeOrganizationSecret(organizationId, body),
      ),
    update: (secretId: string, body: OrganizationSecretUpdateRequest) =>
      run("Organization secret updated", () =>
        updateOrganizationSecret(organizationId, secretId, body),
      ),
    sync: (secretId: string) =>
      run("Organization copy synced from your vault", () =>
        syncOrganizationSecret(organizationId, secretId),
      ),
    permissions: (secretId: string, body: OrganizationSecretPermissionsRequest) =>
      run("Secret access updated", () =>
        setOrganizationSecretPermissions(organizationId, secretId, body),
      ),
    remove: (secretId: string) =>
      run("Organization secret deleted", () =>
        deleteOrganizationSecret(organizationId, secretId),
      ),
  };
}
