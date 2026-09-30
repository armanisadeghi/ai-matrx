"use client";

/**
 * "Who hears about it" — the monitor's alert recipients and its Slack channel
 * (NEWS-ENGINE-SPEC §7.4), saved through `POST /coverage/trackers/{id}/delivery`
 * because only the server can check that each person can open the monitor and
 * that the Slack credential is this organization's and a real incoming webhook.
 * Refusals come back one sentence per problem and are shown as-is.
 *
 * Hosted by the tracker editor (the ONE editor). On a monitor that is not saved
 * yet, the choice is held and committed by the editor's Save right after the
 * monitor exists (`registerCommit`).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationMembers } from "@/features/organizations/hooks";
import { fetchVaultItems } from "@/features/secrets/vault-service";
import type { VaultItem } from "@/features/secrets/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  initialRecipients,
  recipientRoster,
} from "@/features/marketing/monitor-setup/model";

import { saveMonitorDelivery } from "./api";

/** The incoming-webhook credential kinds the Slack channel accepts (aidream
 * `notifications/channels/slack.py::WEBHOOK_DEFINITION_KEYS`). */
const SLACK_DEFINITION_KEYS = new Set([
  "incoming_webhook",
  "slack_incoming_webhook",
]);
const NO_SLACK = "__none__";

export interface DeliveryChoice {
  recipients: string[];
  slackItemId: string | null;
}

export function DeliveryControls({
  organizationId,
  trackerId,
  currentUserId,
  savedRecipients,
  savedSlackItemId,
  registerCommit,
}: {
  organizationId: string;
  trackerId: string | null;
  /** The person saving: a NEW monitor's one preselected recipient, and nobody else. */
  currentUserId: string | null;
  savedRecipients: string[];
  savedSlackItemId: string | null;
  /** The editor calls the registered function after it saves the monitor. */
  registerCommit?: (
    commit: ((trackerId: string) => Promise<void>) | null,
  ) => void;
}) {
  const dispatch = useAppDispatch();
  const {
    members,
    loading: membersLoading,
    error: membersError,
  } = useOrganizationMembers(organizationId);
  const [slackItems, setSlackItems] = useState<VaultItem[] | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  // A new monitor starts with exactly the person saving it — saved explicitly —
  // never another member (acceptance defect C); a saved one shows its own list.
  const [initial] = useState(() =>
    initialRecipients({ trackerId, saved: savedRecipients, currentUserId }),
  );
  const [choice, setChoice] = useState<DeliveryChoice>({
    recipients: initial.recipients,
    slackItemId: savedSlackItemId,
  });
  const [dirty, setDirty] = useState(initial.commitOnSave);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The saved values arrive after the monitor read; take them until the person edits.
  const savedKey = `${savedRecipients.join(",")}|${savedSlackItemId ?? ""}`;
  const [appliedKey, setAppliedKey] = useState(savedKey);
  if (!dirty && appliedKey !== savedKey) {
    setAppliedKey(savedKey);
    setChoice({
      recipients: [...new Set(savedRecipients)],
      slackItemId: savedSlackItemId,
    });
  }

  useEffect(() => {
    let alive = true;
    fetchVaultItems({ kind: "organization", organizationId })
      .then(
        (items) =>
          alive &&
          setSlackItems(
            items.filter((i) => SLACK_DEFINITION_KEYS.has(i.definition_key)),
          ),
      )
      .catch((error: unknown) => {
        if (!alive) return;
        setSlackItems([]);
        setVaultError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [organizationId]);

  const commit = async (id: string) => {
    setSaving(true);
    setProblem(null);
    try {
      await saveMonitorDelivery(dispatch, id, organizationId, {
        alert_recipient_user_ids: choice.recipients,
        slack_credential_item_id: choice.slackItemId,
      });
      setDirty(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProblem(message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Hand the editor the latest unsaved choice (null once saved).
  useEffect(() => {
    registerCommit?.(dirty ? commit : null);
  });

  const toggle = (userId: string, on: boolean) => {
    setDirty(true);
    setChoice((cur) => ({
      ...cur,
      recipients: on
        ? [...new Set([...cur.recipients, userId])]
        : cur.recipients.filter((r) => r !== userId),
    }));
  };

  return (
    <div className="flex flex-col gap-2" data-surface-value="monitor_delivery">
      <p className="text-sm text-foreground">
        {choice.recipients.length
          ? `${choice.recipients.length} ${choice.recipients.length === 1 ? "person hears" : "people hear"} about it, each on their own notification preferences.`
          : "If you pick nobody, whoever created this monitor is told, on their own notification preferences."}
      </p>
      {membersError ? (
        <p className="text-xs text-destructive">
          Could not load this organization&apos;s people: {membersError}
        </p>
      ) : membersLoading ? (
        <p className="text-xs text-muted-foreground">Loading people…</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {recipientRoster(members, currentUserId).map((m) => (
            <li key={m.userId}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={choice.recipients.includes(m.userId)}
                  onCheckedChange={(v) => toggle(m.userId, v === true)}
                />
                <span className="truncate text-foreground">
                  {m.user?.displayName || m.user?.email || "A member"}
                </span>
                {m.user?.displayName && m.user.email ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {m.user.email}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Slack channel</span>
        <Select
          value={choice.slackItemId ?? NO_SLACK}
          onValueChange={(v) => {
            setDirty(true);
            setChoice((cur) => ({
              ...cur,
              slackItemId: v === NO_SLACK ? null : v,
            }));
          }}
        >
          <SelectTrigger
            className="h-8 w-64 text-sm"
            aria-label="Slack channel"
          >
            <SelectValue placeholder={slackItems ? "No Slack" : "Loading…"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SLACK}>No Slack</SelectItem>
            {(slackItems ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {slackItems && slackItems.length === 0 ? (
          <span className="text-muted-foreground">
            This organization has no Slack incoming webhook in its Vault yet.{" "}
            <Link href="/vault" className="text-primary">
              Add one in the Vault
            </Link>
            , then pick it here.
          </span>
        ) : null}
        {vaultError ? (
          <span className="text-destructive">
            Could not read the Vault: {vaultError}
          </span>
        ) : null}
      </div>
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      {trackerId ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || saving}
            onClick={() =>
              void commit(trackerId)
                .then(() =>
                  toast.success("Saved who hears about this monitor."),
                )
                .catch(() => undefined)
            }
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {dirty ? "Save who hears about it" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Saved together with the monitor.
        </p>
      )}
    </div>
  );
}
