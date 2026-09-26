"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_INVENTORY,
  disconnectGitHubConnection,
  loadGitHubConnectionInventory,
  startGitHubConnection,
  syncGitHubConnection,
} from "./service";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";

export function useGitHubConnection() {
  const organizationId = useAppSelector(selectOrganizationId);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [inventory, setInventory] = useState(EMPTY_INVENTORY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The inventory READ's own failure (never an action's), so a list drawn from
   * `inventory` can say "couldn't load" instead of "no repositories yet".
   */
  const [readError, setReadError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setInventory(await loadGitHubConnectionInventory());
      setReadError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to load GitHub.";
      setError(message);
      setReadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    let active = true;
    void loadGitHubConnectionInventory()
      .then((loaded) => {
        if (!active) return;
        setInventory(loaded);
        setReadError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          const message =
            cause instanceof Error ? cause.message : "Unable to load GitHub.";
          setError(message);
          setReadError(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const connect = async (returnUrl = window.location.pathname) => {
    if (!organizationId) {
      setError("Select an organization before connecting GitHub.");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await startGitHubConnection(returnUrl, organizationId);
    if (outcome.ok) {
      await reload();
    } else if (!outcome.cancelled) {
      // A complete OAuth exchange can persist `needs_attention`; refresh it so
      // the card tells the truth instead of retaining a stale disconnected row.
      await reload();
      setError(outcome.error);
    }
    setBusy(false);
  };

  const install = async (returnUrl = window.location.pathname) => {
    if (!organizationId) {
      setError("Select an organization before adding GitHub access.");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await startGitHubConnection(returnUrl, organizationId, "install");
    if (outcome.ok) {
      await reload();
    } else if (!outcome.cancelled) {
      await reload();
      setError(outcome.error);
    }
    setBusy(false);
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      await syncGitHubConnection();
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to refresh GitHub.",
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectGitHubConnection();
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to disconnect GitHub.",
      );
    } finally {
      setBusy(false);
    }
  };

  return {
    inventory: isAuthenticated ? inventory : EMPTY_INVENTORY,
    loading: isAuthenticated && loading,
    busy,
    error,
    readError: isAuthenticated ? readError : null,
    reload,
    connect,
    install,
    sync,
    disconnect,
  };
}
