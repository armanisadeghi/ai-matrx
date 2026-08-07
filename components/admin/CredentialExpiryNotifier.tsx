"use client";

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";
import {
  credentialMaintenancePath,
  getCredentialExpiryMessage,
  getCredentialExpiryStatus,
  parseCredentialMaintenanceMap,
  WEB_APP_CONFIG_SLUG,
} from "@/features/admin/applications/config/credential-maintenance";

const DISMISS_KEY_PREFIX = "credential-expiry-dismissed-";
const CONFIG_ERROR_TOAST_ID = "credential-maintenance-config-error";

export default function CredentialExpiryNotifier() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  useEffect(() => {
    const activeToastIds: Array<string | number> = [];
    let cancelled = false;

    const openManager = (credentialId?: string) => {
      window.location.assign(
        credentialId
          ? credentialMaintenancePath(credentialId)
          : "/administration/applications/configuration",
      );
    };

    if (!isSuperAdmin) {
      toast.dismiss(CONFIG_ERROR_TOAST_ID);
      return undefined;
    }

    const loadCredentialMaintenance = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_config")
        .select("config")
        .eq("app", WEB_APP_CONFIG_SLUG)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        toast.error("Credential monitoring is unavailable", {
          id: CONFIG_ERROR_TOAST_ID,
          description:
            error?.message ??
            `The ${WEB_APP_CONFIG_SLUG} app_config row is missing. Credential expiry checks cannot run.`,
          duration: Infinity,
          action: {
            label: "Manage",
            onClick: () => openManager(),
          },
        });
        activeToastIds.push(CONFIG_ERROR_TOAST_ID);
        return;
      }

      const parsed = parseCredentialMaintenanceMap(data.config);
      if (!parsed.success) {
        toast.error("Credential monitoring is misconfigured", {
          id: CONFIG_ERROR_TOAST_ID,
          description:
            parsed.error.issues[0]?.message ??
            "credential_maintenance is missing or invalid.",
          duration: Infinity,
          action: {
            label: "Manage",
            onClick: () => openManager(),
          },
        });
        activeToastIds.push(CONFIG_ERROR_TOAST_ID);
        return;
      }

      for (const [credentialId, entry] of Object.entries(parsed.data)) {
        const status = getCredentialExpiryStatus(entry);
        if (!status.expiringSoon) continue;

        const dismissKey = `${DISMISS_KEY_PREFIX}${credentialId}-${entry.expires_at}`;
        const dismissed = localStorage.getItem(dismissKey);
        if (dismissed && !status.expired) continue;

        const toastId = `credential-expiry-${credentialId}-${entry.expires_at}`;
        activeToastIds.push(toastId);
        toast(
          status.expired
            ? `${entry.label} credential expired`
            : `${entry.label} credential expires soon`,
          {
            id: toastId,
            description: getCredentialExpiryMessage(entry),
            duration: Infinity,
            action: {
              label: "Manage",
              onClick: () => openManager(credentialId),
            },
            cancel: {
              label: "Dismiss",
              onClick: () => {
                localStorage.setItem(dismissKey, new Date().toISOString());
              },
            },
          },
        );
      }
    };

    void loadCredentialMaintenance();

    return () => {
      cancelled = true;
      for (const toastId of activeToastIds) toast.dismiss(toastId);
    };
  }, [isSuperAdmin]);

  return null;
}
