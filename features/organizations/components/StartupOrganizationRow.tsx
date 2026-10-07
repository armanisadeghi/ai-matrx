"use client";

// features/organizations/components/StartupOrganizationRow.tsx
//
// THE "Start-up organization" SETTING (active-organization plan, 2026-10-07):
// which organization the app opens to when the person has no last active one
// (`users.user_preferences.startup_organization_id`, written only through
// `users.set_startup_organization`). It chooses what the shell OPENS to and
// nothing else — the load ladder is its only reader.

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  readAccountOrganizationChoices,
  writeStartupOrganization,
} from "@/lib/organizations/accountOrganizationChoices";

/** The "no start-up organization" choice: the ladder falls to the first one. */
const NONE = "";

export function StartupOrganizationRow({ last = false }: { last?: boolean }) {
  const userId = useAppSelector(selectUserId);
  const { organizations, loading } = useUserOrganizations();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    readAccountOrganizationChoices(userId)
      .then((choices) => {
        if (!cancelled) setValue(choices.startupOrganizationId ?? NONE);
      })
      .catch((err: unknown) => {
        console.error("[StartupOrganizationRow] read failed", err);
        if (!cancelled) setError("Couldn't load this setting. Reload to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onValueChange = (next: string) => {
    const previous = value;
    setValue(next);
    setError(null);
    setSaving(true);
    writeStartupOrganization(next === NONE ? null : next)
      .catch((err: unknown) => {
        console.error("[StartupOrganizationRow] save failed", err);
        setValue(previous);
        setError("Couldn't save. Try again.");
      })
      .finally(() => setSaving(false));
  };

  const options = [
    { value: NONE, label: "My first organization" },
    ...organizations.map((org) => ({ value: org.id, label: org.name })),
  ];

  return (
    <SettingsSelect
      icon={Building2}
      label="Start-up organization"
      description="Opens when you have no last-used organization"
      value={value ?? NONE}
      onValueChange={onValueChange}
      options={options}
      disabled={value === null || loading || saving}
      error={error ?? undefined}
      id="startup-organization"
      width="lg"
      last={last}
    />
  );
}
