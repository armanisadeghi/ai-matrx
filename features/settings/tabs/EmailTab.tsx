"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";

/**
 * Email notification preferences.
 *
 * Unlike every other tab in Phase 6, this does NOT use `useSetting()` —
 * email preferences are stored in a separate Supabase table and exposed via
 * `/api/user/email-preferences` rather than the unified sync engine. Until
 * the migration brings them under the same policy, we keep the fetch/save
 * pattern but swap the UI shell to primitives.
 *
 * TODO: migrate `/api/user/email-preferences` to a new Redux slice + sync
 * policy so `useSetting("emailPreferences.*")` works here.
 */
interface EmailPreferencesShape {
  sharing_notifications: boolean;
  organization_invitations: boolean;
  resource_updates: boolean;
  marketing_emails: boolean;
  weekly_digest: boolean;
  task_notifications: boolean;
  comment_notifications: boolean;
  message_notifications: boolean;
  message_digest: boolean;
}

const DEFAULTS: EmailPreferencesShape = {
  sharing_notifications: true,
  organization_invitations: true,
  resource_updates: true,
  marketing_emails: false,
  weekly_digest: true,
  task_notifications: true,
  comment_notifications: true,
  message_notifications: true,
  message_digest: false,
};

export default function EmailTab() {
  const [prefs, setPrefs] = useState<EmailPreferencesShape>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithOrganization("/api/user/email-preferences");
        const data = await res.json();
        if (!cancelled && data.success && data.data) setPrefs(data.data);
      } catch {
        // network errors fall through to defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key: keyof EmailPreferencesShape) => (v: boolean) => {
    setPrefs((p) => ({ ...p, [key]: v }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Organization-scoped route: since the 2026-09-19 ruling it refuses a
      // request that names no organization rather than filing the row in the
      // person's personal workspace. `fetchWithOrganization` carries the
      // selected organization and, on a refusal, opens the picker and replays
      // once with whatever they set.
      const res = await fetchWithOrganization("/api/user/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setDirty(false);
        return;
      }
      // 🚨 NOTHING FAILS SILENTLY. This used to read `const data = await
      // res.json(); if (data.success) setDirty(false);` — a failed save left
      // the form dirty and said nothing at all, so the person saw a Save
      // button that had apparently done nothing and no reason why.
      toast.error("Your email preferences were not saved", {
        description:
          typeof data?.user_message === "string"
            ? data.user_message
            : typeof data?.error === "string"
              ? data.error
              : "Something went wrong saving them. Try again in a moment.",
      });
    } catch (error) {
      // The person closed the organization picker: an answer meaning "not
      // now". Nothing was saved and nothing is claimed — the form stays dirty
      // and they can press Save again whenever they like.
      if (isOrganizationSelectionCancelled(error)) return;
      toast.error("Your email preferences were not saved", {
        description:
          error instanceof Error
            ? error.message
            : "Something went wrong saving them. Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <SettingsSubHeader
        title="Email"
        description="Which emails you receive from the product."
        icon={Mail}
      />

      <SettingsCallout tone="info">
        Email preferences are stored separately and require an explicit save.
      </SettingsCallout>

      <SettingsSection title="Collaboration">
        <SettingsSwitch
          label="Sharing notifications"
          description="When someone shares a document, agent, or task with you."
          checked={prefs.sharing_notifications}
          onCheckedChange={set("sharing_notifications")}
        />
        <SettingsSwitch
          label="Organization invitations"
          checked={prefs.organization_invitations}
          onCheckedChange={set("organization_invitations")}
        />
        <SettingsSwitch
          label="Task notifications"
          description="Assignments, status changes, due-date reminders."
          checked={prefs.task_notifications}
          onCheckedChange={set("task_notifications")}
        />
        <SettingsSwitch
          label="Comment notifications"
          checked={prefs.comment_notifications}
          onCheckedChange={set("comment_notifications")}
          last
        />
      </SettingsSection>

      <SettingsSection title="Communication">
        <SettingsSwitch
          label="Message notifications"
          description="New direct messages and mentions."
          checked={prefs.message_notifications}
          onCheckedChange={set("message_notifications")}
        />
        <SettingsSwitch
          label="Resource updates"
          description="Changes to resources you follow."
          checked={prefs.resource_updates}
          onCheckedChange={set("resource_updates")}
          last
        />
      </SettingsSection>

      <SettingsSection title="Digests">
        <SettingsSwitch
          label="Weekly digest"
          description="A summary of the past week delivered Monday morning."
          checked={prefs.weekly_digest}
          onCheckedChange={set("weekly_digest")}
        />
        <SettingsSwitch
          label="Message digest"
          description="Unread messages bundled instead of sent individually."
          checked={prefs.message_digest}
          onCheckedChange={set("message_digest")}
          last
        />
      </SettingsSection>

      <SettingsSection title="Marketing">
        <SettingsSwitch
          label="Product updates & marketing"
          description="Product announcements, launch emails, surveys."
          checked={prefs.marketing_emails}
          onCheckedChange={set("marketing_emails")}
          last
        />
      </SettingsSection>

      <SettingsSection title="Save">
        <SettingsButton
          label="Apply email preferences"
          description={
            dirty ? "You have unsaved changes." : "Everything is up to date."
          }
          actionLabel={saving ? "Saving…" : dirty ? "Save" : "Saved"}
          kind={dirty ? "default" : "outline"}
          onClick={save}
          disabled={!dirty || saving}
          loading={saving}
          last
        />
      </SettingsSection>
    </>
  );
}
