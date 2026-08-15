"use client";

import { useEffect, useState } from "react";

import {
  configureMySmsTaskNotifications,
  getMySmsTaskNotificationPreference,
  type SmsTaskNotificationPreference,
} from "@/features/sms/notification-preferences";

export interface SmsTaskNotificationsResult {
  success: boolean;
  message: string;
}

/** Hydrates and mutates only the caller's task-reminder SMS family preference. */
export function useSmsTaskNotifications() {
  const [preference, setPreference] =
    useState<SmsTaskNotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SmsTaskNotificationsResult | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const current = await getMySmsTaskNotificationPreference();
        if (active) setPreference(current);
      } catch (error) {
        if (!active) return;
        setResult({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Unable to load task reminder preferences.",
        });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const setTaskNotifications = async (enabled: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const updated = await configureMySmsTaskNotifications(enabled);
      setPreference(updated);
      setResult({
        success: true,
        message: enabled
          ? "Task reminder texts enabled."
          : "Task reminder texts disabled.",
      });
    } catch (error) {
      setResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to update task reminder preferences.",
      });
    } finally {
      setLoading(false);
    }
  };

  return { preference, loading, result, setTaskNotifications };
}
