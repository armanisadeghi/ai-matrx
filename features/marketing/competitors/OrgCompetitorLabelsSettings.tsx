"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { SettingAnchor } from "@/features/settings/doors/SettingAnchor";
import { SettingAccessGate } from "@/features/access-gate/components/SettingAccessGate";
import { ORG_MODULE_CUSTOM_VALUE_ADD_ACTION } from "@/features/messaging/actions/settingRequestActionRegistry";
import {
  addOrgModuleCustomValue,
  getOrgModuleCustomValues,
  removeOrgModuleCustomValue,
  setOrgModuleCustomValuePolicy,
  type OrgModuleCustomValues,
} from "@/features/organizations/orgModuleSettings";
import {
  COMPETITOR_LABELS_NAMESPACE,
  COMPETITOR_LABELS_SETTING_ID,
  COMPETITOR_MODULE_KEY,
} from "@/features/marketing/competitors/settings";

export function OrgCompetitorLabelsSettings({
  orgId,
  orgSlugOrId,
  canEdit,
}: {
  orgId: string;
  orgSlugOrId: string;
  canEdit: boolean;
}) {
  const searchParams = useSearchParams();
  const requestedValue = searchParams.get("setting_value")?.trim() ?? "";
  const [state, setState] = useState<OrgModuleCustomValues | null>(null);
  const [value, setValue] = useState(requestedValue);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getOrgModuleCustomValues(
      orgId,
      COMPETITOR_MODULE_KEY,
      COMPETITOR_LABELS_NAMESPACE,
    )
      .then((result) => {
        if (alive) setState(result);
      })
      .catch((error) => {
        if (alive) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not load organization labels.",
          );
          setState({ values: [], membersCanAdd: false, canAdmin: false });
        }
      });
    return () => {
      alive = false;
    };
  }, [orgId]);

  if (!state) {
    return (
      <div className="flex justify-center py-8">
        <Loader2
          className="h-5 w-5 animate-spin text-muted-foreground"
          aria-label="Loading competitor labels"
        />
      </div>
    );
  }

  const canAdd = canEdit || state.membersCanAdd;

  async function add() {
    const next = value.trim();
    if (!next) return;
    setBusy("add");
    try {
      const values = await addOrgModuleCustomValue(
        orgId,
        COMPETITOR_MODULE_KEY,
        COMPETITOR_LABELS_NAMESPACE,
        next,
      );
      setState((current) => (current ? { ...current, values } : current));
      setValue("");
      toast.success(`“${next}” is now available to your organization.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add that label.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(label: string) {
    setBusy(label);
    try {
      const values = await removeOrgModuleCustomValue(
        orgId,
        COMPETITOR_MODULE_KEY,
        COMPETITOR_LABELS_NAMESPACE,
        label,
      );
      setState((current) => (current ? { ...current, values } : current));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove that label.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function changePolicy(next: boolean) {
    setBusy("policy");
    try {
      await setOrgModuleCustomValuePolicy(orgId, COMPETITOR_MODULE_KEY, next);
      setState((current) =>
        current ? { ...current, membersCanAdd: next } : current,
      );
      toast.success(
        next
          ? "Any member can now add labels."
          : "Only admins can now add labels.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not change that policy.",
      );
    } finally {
      setBusy(null);
    }
  }

  const editor = (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
          maxLength={80}
          placeholder="Add a shared label"
          aria-label="New organization competitor label"
        />
        <Button
          disabled={busy !== null || !value.trim()}
          onClick={() => void add()}
        >
          {busy === "add" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Add label
        </Button>
      </div>

      <div className="flex min-h-9 flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
        {state.values.length > 0 ? (
          state.values.map((label) => (
            <Badge
              key={label}
              variant="secondary"
              className="gap-1 pl-2.5 pr-1"
            >
              {label}
              {canEdit ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void remove(label)}
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label={`Remove ${label}`}
                >
                  {busy === label ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <X className="h-3 w-3" aria-hidden />
                  )}
                </button>
              ) : null}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">
            No shared competitor labels yet.
          </span>
        )}
      </div>

      {canEdit ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <span>
            <Label htmlFor="competitor-label-member-policy">
              Members may add shared labels
            </Label>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Off means organization owners and admins add the dropdown values.
            </span>
          </span>
          <Switch
            id="competitor-label-member-policy"
            checked={state.membersCanAdd}
            disabled={busy !== null}
            onCheckedChange={(next) => void changePolicy(next)}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <SettingAnchor id={COMPETITOR_LABELS_SETTING_ID}>
      {!canAdd ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="requested-competitor-label">
              Label you want added
            </Label>
            <Input
              id="requested-competitor-label"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={80}
              placeholder="For example: Local rival"
            />
          </div>
          <SettingAccessGate
            canManage={false}
            organizationId={orgId}
            organizationSlugOrId={orgSlugOrId}
            settingKey={COMPETITOR_LABELS_SETTING_ID}
            settingLabel="organization competitor labels"
            actionKey={ORG_MODULE_CUSTOM_VALUE_ADD_ACTION}
            actionPayload={{
              organization_id: orgId,
              module_key: COMPETITOR_MODULE_KEY,
              namespace: COMPETITOR_LABELS_NAMESPACE,
              value: value.trim(),
            }}
            defaultMessage={
              value.trim()
                ? `Please add “${value.trim()}” to our competitor labels.`
                : "Please add this value to our competitor labels."
            }
            requestReady={value.trim().length > 0}
          >
            {editor}
          </SettingAccessGate>
        </div>
      ) : (
        editor
      )}
    </SettingAnchor>
  );
}
