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
import { fetchDatedChanges } from "@/features/admin/dated-changes/service";
import {
  DATED_CHANGES_PAGE_HREF,
  describeDatedChange,
} from "@/features/admin/dated-changes/describe";

const DISMISS_KEY_PREFIX = "credential-expiry-dismissed-";
const CONFIG_ERROR_TOAST_ID = "credential-maintenance-config-error";
const DATED_DISMISS_KEY_PREFIX = "dated-change-dismissed-";
const DATED_READ_ERROR_TOAST_ID = "dated-changes-read-error";

/**
 * SECOND SOURCE (2026-09-28): dated changes — a database change stored now and applied on a set
 * date (first use: a model price a provider announced for later). The same mechanics as the
 * credential half — super-admin only, `duration: Infinity`, a Manage door — made more serious:
 * a refused, failed or overdue change, one that will be refused (drift), and one whose time zone
 * the source never stated have NO Dismiss and cannot be swiped away; they stay until resolved.
 * Scheduled, upcoming and applied notices may be dismissed (per browser, per change and state).
 * The database decides which is which (`platform.dated_changes_for_attention`); the attention
 * dock shows the same items on every page and polls, so a refusal at midnight shows without a
 * reload. Design: common-docs/projects/checks-run-in-the-app/DATED-CHANGES-DESIGN.md.
 */
function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Private window / blocked storage: the notice simply returns next load.
  }
}

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
        .is("deleted_at", null)
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

    const loadDatedChanges = async () => {
      let changes;
      try {
        changes = await fetchDatedChanges(false);
      } catch (error) {
        if (cancelled) return;
        // A read that failed is not "nothing scheduled": say so, briefly (the dock repeats the
        // read on its own poll and keeps the failure on screen while it lasts).
        const failure = describeFailure(error, {
          action: "checking scheduled price changes",
          retrySafe: true,
          fallback: "The scheduled-changes read failed.",
        });
        toast.error("Couldn't check scheduled price changes just now", {
          id: DATED_READ_ERROR_TOAST_ID,
          description: `${failure.sentence} ${failure.remedy}`.trim(),
          duration: 8000,
        });
        activeToastIds.push(DATED_READ_ERROR_TOAST_ID);
        return;
      }
      if (cancelled) return;
      for (const change of changes) {
        if (!change.attention) continue;
        const words = describeDatedChange(change);
        const dismissKey = `${DATED_DISMISS_KEY_PREFIX}${change.id}-${change.attention}`;
        if (words.dismissible && readDismissed(dismissKey)) continue;
        const toastId = `dated-change-${change.id}-${change.attention}`;
        activeToastIds.push(toastId);
        toast(words.headline, {
          id: toastId,
          description: words.sentence,
          duration: Infinity,
          dismissible: words.dismissible,
          action: {
            label: "Manage",
            onClick: () => window.location.assign(`${DATED_CHANGES_PAGE_HREF}#${change.id}`),
          },
          ...(words.dismissible
            ? {
                cancel: {
                  label: "Dismiss",
                  onClick: () => writeDismissed(dismissKey),
                },
              }
            : {}),
        });
      }
    };

    void loadCredentialMaintenance();
    void loadDatedChanges();

    return () => {
      cancelled = true;
      for (const toastId of activeToastIds) toast.dismiss(toastId);
    };
  }, [isSuperAdmin]);

  return null;
}
