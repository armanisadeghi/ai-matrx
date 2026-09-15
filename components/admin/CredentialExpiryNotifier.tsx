"use client";

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { toast } from "@/lib/toast";
import { describeFailure } from "@/lib/failure/transport";
import { createClient } from "@/utils/supabase/client";
import {
  credentialMaintenanceIndexPath,
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
          : credentialMaintenanceIndexPath(),
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
        // WALL W2 (2026-09-15). An Expert on `/masterwork/new` was shown a
        // permanent toast titled "Credential monitoring is unavailable" whose
        // body was, verbatim, `canceling statement due to statement timeout`.
        // TWO lies in one toast. The body was Postgres talking to a DBA, and
        // the title claimed a standing configuration problem when the database
        // had simply not answered this one read inside its eight seconds —
        // which is not a credential problem at all, needs no administration
        // screen, and must not sit on the page forever with `duration:
        // Infinity`. A transient refusal and a missing row are different
        // facts, so they are now different toasts.
        const failure = describeFailure(error, {
          action: "checking credential expiry",
          retrySafe: true,
          fallback: `The ${WEB_APP_CONFIG_SLUG} app_config row is missing.`,
        });
        if (error && failure.transient) {
          console.error("[credential-expiry] config read failed", error);
          toast.error("Couldn't check credential expiry just now", {
            id: CONFIG_ERROR_TOAST_ID,
            description: `${failure.sentence} ${failure.remedy}`.trim(),
            duration: 8000,
          });
          activeToastIds.push(CONFIG_ERROR_TOAST_ID);
          return;
        }
        // Not transient: either the row is genuinely absent, or the read was
        // refused for a reason an administrator must look at. That IS a
        // standing configuration problem, and it keeps the standing toast.
        if (error) console.error("[credential-expiry] config read failed", error);
        toast.error("Credential monitoring is unavailable", {
          id: CONFIG_ERROR_TOAST_ID,
          description: error
            ? "The credential-monitoring configuration could not be read. Credential expiry checks cannot run."
            : `The ${WEB_APP_CONFIG_SLUG} app_config row is missing. Credential expiry checks cannot run.`,
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
