// File: features/user-profile/hooks/useUserFormProfile.ts
//
// Fetch + save the rich `public.user_form_profile` (the "agent on behalf
// of the user" data — legal name, addresses, phones, emails, social
// handles, emergency contacts, etc.). Local state only — this shape is
// large and only needed on the profile surface, so we don't pay the cost
// of putting it in Redux.
//
// Companion to `useUserProfile` (account / auth metadata). Section-level
// saves on the form are encouraged: only dirty top-level keys are sent.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  EMPTY_FORM_PROFILE,
  type UserFormProfileData,
  type UserFormProfilePatch,
} from "@/features/user-profile/types";

type LoadState = "idle" | "loading" | "ready" | "error";

interface UseUserFormProfileReturn {
  data: UserFormProfileData;
  loadState: LoadState;
  saving: boolean;
  /** True if any top-level key differs from the last server snapshot. */
  dirty: boolean;
  /** Per-section dirty check — used by section-level Save buttons. */
  isDirtyFor: (keys: ReadonlyArray<keyof UserFormProfileData>) => boolean;
  loadError: string | null;
  setField: <K extends keyof UserFormProfileData>(
    key: K,
    value: UserFormProfileData[K],
  ) => void;
  setFields: (patch: Partial<UserFormProfileData>) => void;
  /** PATCH only the dirty fields. Returns success bool. */
  save: () => Promise<boolean>;
  /** PATCH only the dirty fields **within the given keys**. Used by
   * per-section Save buttons so the user can save Identity without
   * accidentally clobbering an in-progress edit to Contact. */
  saveSection: (
    keys: ReadonlyArray<keyof UserFormProfileData>,
  ) => Promise<boolean>;
  reset: () => Promise<void>;
}

const ENDPOINT = "/api/user/form-profile";

function diffKeys<T extends Record<string, unknown>>(
  next: T,
  prev: T,
): (keyof T)[] {
  const out: (keyof T)[] = [];
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!Object.is(next[key], prev[key])) out.push(key);
  }
  return out;
}

export function useUserFormProfile(): UseUserFormProfileReturn {
  const [data, setData] = useState<UserFormProfileData>(EMPTY_FORM_PROFILE);
  const [serverData, setServerData] =
    useState<UserFormProfileData>(EMPTY_FORM_PROFILE);
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
        | { success: true; data: UserFormProfileData }
        | { success: false; msg: string };
      if (!mounted.current) return;
      if (!res.ok || !json.success) {
        const msg =
          ("msg" in json && json.msg) ||
          `Couldn't load form profile (${res.status})`;
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

  const setField: UseUserFormProfileReturn["setField"] = useCallback(
    (key, value) => setData((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const setFields = useCallback(
    (patch: Partial<UserFormProfileData>) =>
      setData((prev) => ({ ...prev, ...patch })),
    [],
  );

  const sendPatch = useCallback(
    async (patch: UserFormProfilePatch): Promise<boolean> => {
      if (Object.keys(patch).length === 0) return true;
      setSaving(true);
      try {
        const res = await fetch(ENDPOINT, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json()) as
          | { success: true; data: UserFormProfileData; msg?: string }
          | { success: false; msg: string };

        if (!res.ok || !json.success) {
          const msg =
            ("msg" in json && json.msg) || `Save failed (${res.status})`;
          toast.error(msg);
          return false;
        }

        if (mounted.current) {
          // Merge server echo over local state — preserves user edits to
          // sections that weren't part of this patch.
          setData((prev) => ({ ...prev, ...buildLocalEcho(json.data, patch) }));
          setServerData(json.data);
        }
        toast.success("Profile saved");
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        toast.error(msg);
        return false;
      } finally {
        if (mounted.current) setSaving(false);
      }
    },
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const dirtyKeys = diffKeys(
      data as unknown as Record<string, unknown>,
      serverData as unknown as Record<string, unknown>,
    );
    const patch: UserFormProfilePatch = {};
    for (const key of dirtyKeys) {
      (patch as Record<string, unknown>)[key as string] = (
        data as unknown as Record<string, unknown>
      )[key as string];
    }
    return sendPatch(patch);
  }, [data, serverData, sendPatch]);

  const saveSection = useCallback(
    async (keys: ReadonlyArray<keyof UserFormProfileData>): Promise<boolean> => {
      const patch: UserFormProfilePatch = {};
      let anyDirty = false;
      for (const key of keys) {
        if (!Object.is(data[key], serverData[key])) {
          (patch as Record<string, unknown>)[key as string] = data[key];
          anyDirty = true;
        }
      }
      if (!anyDirty) return true;
      return sendPatch(patch);
    },
    [data, serverData, sendPatch],
  );

  const reset = useCallback(async () => {
    await load();
  }, [load]);

  const isDirtyFor = useCallback(
    (keys: ReadonlyArray<keyof UserFormProfileData>): boolean => {
      return keys.some((key) => !Object.is(data[key], serverData[key]));
    },
    [data, serverData],
  );

  const dirty =
    diffKeys(
      data as unknown as Record<string, unknown>,
      serverData as unknown as Record<string, unknown>,
    ).length > 0;

  return {
    data,
    loadState,
    saving,
    dirty,
    isDirtyFor,
    loadError,
    setField,
    setFields,
    save,
    saveSection,
    reset,
  };
}

/**
 * After a successful save the server echoes the full row. We want to:
 *   • Trust the server's value for every key the user just saved (canonical).
 *   • Leave the user's in-flight edits intact for keys they DIDN'T save.
 *
 * That means: take the server echo for the patched keys and leave the rest
 * of local state alone. Returns the slice of the server echo that should
 * overwrite local state.
 */
function buildLocalEcho(
  server: UserFormProfileData,
  patch: UserFormProfilePatch,
): Partial<UserFormProfileData> {
  const out: Partial<UserFormProfileData> = {};
  for (const key of Object.keys(patch) as (keyof UserFormProfileData)[]) {
    (out as Record<string, unknown>)[key] = server[key];
  }
  return out;
}
