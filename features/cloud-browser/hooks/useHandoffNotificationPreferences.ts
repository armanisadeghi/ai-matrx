"use client";

/**
 * The ONE seam the Cloud Browser consent surface reads and writes.
 *
 * It composes the three canonical stores NOTIFICATIONS.md §5 names — never a
 * feature-local blob (see `../notificationPreferences.ts` for why that was a
 * defect) — and states the one channel that is not a preference at all.
 *
 * 🚨 `in_app` is always ON and is not togglable. NOTIFICATIONS.md §2: the
 * assist "is never optional and never a preference — it is how the app itself
 * shows the pending ask; turning it off would mean the surface lies about its
 * own state." It shipped as an off-by-default switch, which promised the user
 * a choice the server does not honour and (had the server honoured it) would
 * have silenced the only channel that actually works.
 */

import { useCallback, useEffect, useState } from "react";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { NotificationChannel, NotificationConsent } from "../types";
import {
  loadHandoffChannelPreferences,
  NO_HANDOFF_CHANNELS,
  setHandoffEmailPreference,
  setHandoffSmsPreference,
  type HandoffChannelPreferences,
} from "../notificationPreferences";

export interface HandoffNotificationPreferences {
  consent: NotificationConsent;
  /** False until the person has a verified number; the text switch says so
   *  instead of failing silently. */
  smsEnrolled: boolean;
  loading: boolean;
  error: string | null;
  setChannel: (channel: NotificationChannel, enabled: boolean) => Promise<void>;
}

export function useHandoffNotificationPreferences(
  /** From the profile row — the one-time "we showed you the card" stamp. */
  acknowledgedAt: string | null,
): HandoffNotificationPreferences {
  const [desktop, setDesktop] = useSetting<boolean>(
    "userPreferences.messaging.showDesktopNotifications",
  );
  const [channels, setChannels] =
    useState<HandoffChannelPreferences>(NO_HANDOFF_CHANNELS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await loadHandoffChannelPreferences();
        if (!cancelled) setChannels(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not read how we reach you.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setChannel = useCallback(
    async (channel: NotificationChannel, enabled: boolean) => {
      setError(null);
      try {
        if (channel === "in_app") {
          // Not a preference (§2). Nothing to write, nothing to refuse.
          return;
        }
        if (channel === "browser") {
          setDesktop(enabled);
          return;
        }
        if (channel === "email") {
          await setHandoffEmailPreference(enabled);
          setChannels((prev) => ({ ...prev, email: enabled }));
          return;
        }
        await setHandoffSmsPreference(enabled);
        setChannels((prev) => ({ ...prev, sms: enabled }));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save how we reach you.",
        );
      }
    },
    [setDesktop],
  );

  return {
    consent: {
      in_app: true,
      browser: desktop === true,
      email: channels.email,
      sms: channels.sms,
      acknowledgedAt,
    },
    smsEnrolled: channels.smsEnrolled,
    loading,
    error,
    setChannel,
  };
}
