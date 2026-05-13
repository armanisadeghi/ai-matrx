// File: features/user-profile/hooks/useUserProfile.ts
//
// Fetch + save the user's account identity (auth.user_metadata +
// public.profiles). Mirrors the EmailTab pattern: local state, explicit
// save, dirty tracking — no Redux slice for the data itself.
//
// After a successful save we DO dispatch `setUserMetadata(...)` so the
// global header avatar/name (driven by `state.userProfile.userMetadata`)
// refreshes immediately. Without that dispatch the user would have to
// reload the page to see their new name everywhere.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setUserMetadata } from "@/lib/redux/slices/userProfileSlice";
import { toast } from "sonner";
import {
  EMPTY_ACCOUNT_DATA,
  type UserAccountData,
  type UserAccountPatch,
} from "@/features/user-profile/types";

type LoadState = "idle" | "loading" | "ready" | "error";

interface UseUserProfileReturn {
  data: UserAccountData;
  loadState: LoadState;
  saving: boolean;
  dirty: boolean;
  /** Loaded error, if any. Saving errors surface via toasts instead. */
  loadError: string | null;
  /** Patch a subset of fields in local state, marking the form dirty. */
  setField: <K extends keyof UserAccountData>(
    key: K,
    value: UserAccountData[K],
  ) => void;
  /** Patch multiple fields at once. */
  setFields: (patch: Partial<UserAccountData>) => void;
  /** PATCH only the dirty fields to the server. Returns success bool. */
  save: () => Promise<boolean>;
  /** Discard local edits and re-fetch from the server. */
  reset: () => Promise<void>;
}

const ENDPOINT = "/api/user/profile";

/**
 * Map a UserAccountData payload back to the Redux userMetadata shape so
 * the header avatar/name stay in sync after save. The Redux slice uses
 * camelCase; the API uses snake_case.
 */
function toReduxMetadata(data: UserAccountData) {
  return {
    fullName: data.full_name,
    name: data.name,
    preferredUsername: data.preferred_username,
    avatarUrl: data.avatar_url,
    picture: data.picture,
  };
}

/**
 * Shallow-diff two objects, returning only keys that differ. Used to send
 * the smallest possible patch to the server.
 */
function diff<T extends Record<string, unknown>>(next: T, prev: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!Object.is(next[key], prev[key])) {
      out[key] = next[key];
    }
  }
  return out;
}

export function useUserProfile(): UseUserProfileReturn {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<UserAccountData>(EMPTY_ACCOUNT_DATA);
  const [serverData, setServerData] = useState<UserAccountData>(
    EMPTY_ACCOUNT_DATA,
  );
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      const json = (await res.json()) as
        | { success: true; data: UserAccountData }
        | { success: false; msg: string };
      if (!mounted.current) return;
      if (!res.ok || !json.success) {
        const msg =
          ("msg" in json && json.msg) || `Couldn't load profile (${res.status})`;
        setLoadError(msg);
        setLoadState("error");
        return;
      }
      setData(json.data);
      setServerData(json.data);
      setLoadState("ready");
    } catch (err) {
      if (!mounted.current) return;
      const msg = err instanceof Error ? err.message : "Network error";
      setLoadError(msg);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField: UseUserProfileReturn["setField"] = useCallback(
    (key, value) => setData((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const setFields = useCallback(
    (patch: Partial<UserAccountData>) =>
      setData((prev) => ({ ...prev, ...patch })),
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const patch = diff(
      data as unknown as Record<string, unknown>,
      serverData as unknown as Record<string, unknown>,
    ) as UserAccountPatch;
    if (Object.keys(patch).length === 0) return true;

    setSaving(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as
        | { success: true; data: UserAccountData; msg?: string }
        | { success: false; msg: string };

      if (!res.ok || !json.success) {
        const msg =
          ("msg" in json && json.msg) || `Save failed (${res.status})`;
        toast.error(msg);
        return false;
      }

      if (mounted.current) {
        setData(json.data);
        setServerData(json.data);
      }
      // Push the new identity into Redux so the header / sidebar / chat
      // sender names all refresh without a reload.
      dispatch(setUserMetadata(toReduxMetadata(json.data)));
      toast.success("Profile saved");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
      return false;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [data, dispatch, serverData]);

  const reset = useCallback(async () => {
    await load();
  }, [load]);

  const dirty =
    Object.keys(
      diff(
        data as unknown as Record<string, unknown>,
        serverData as unknown as Record<string, unknown>,
      ),
    ).length > 0;

  return {
    data,
    loadState,
    saving,
    dirty,
    loadError,
    setField,
    setFields,
    save,
    reset,
  };
}
