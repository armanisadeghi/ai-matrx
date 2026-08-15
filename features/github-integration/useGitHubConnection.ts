"use client";

import { useEffect, useState } from "react";
import {
  disconnectGitHubConnection,
  githubConnectUrl,
  loadGitHubConnectionInventory,
  syncGitHubConnection,
} from "./service";
import type { GitHubConnectionInventory } from "./types";

const EMPTY: GitHubConnectionInventory = {
  connection: null,
  repositories: [],
};

export function useGitHubConnection() {
  const [inventory, setInventory] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setInventory(await loadGitHubConnectionInventory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load GitHub.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void loadGitHubConnectionInventory()
      .then((loaded) => {
        if (active) setInventory(loaded);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load GitHub.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const connect = (returnUrl = window.location.pathname) => {
    window.location.assign(githubConnectUrl(returnUrl));
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      await syncGitHubConnection();
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh GitHub.");
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
      setError(cause instanceof Error ? cause.message : "Unable to disconnect GitHub.");
    } finally {
      setBusy(false);
    }
  };

  return { inventory, loading, busy, error, reload, connect, sync, disconnect };
}
