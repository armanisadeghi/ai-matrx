"use client";

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  isAppleKeyExpiringSoon,
  isAppleKeyExpired,
  getAppleKeyExpiryMessage,
  APPLE_KEY_GENERATION_DATE,
} from "@/lib/apple-key-config";

const DISMISS_KEY_PREFIX = "apple-key-expiry-dismissed-";
const TOAST_ID = `apple-key-expiry-${APPLE_KEY_GENERATION_DATE}`;

export default function AppleKeyExpiryNotifier() {
  const isAdmin = useAppSelector((state) => state.userAuth.isAdmin);

  useEffect(() => {
    if (!isAdmin) {
      toast.dismiss(TOAST_ID);
      return undefined;
    }

    const expiringSoon = isAppleKeyExpiringSoon();
    const expired = isAppleKeyExpired();

    if (!expiringSoon && !expired) return undefined;

    // Check if this specific key generation date's warning was dismissed
    const dismissKey = `${DISMISS_KEY_PREFIX}${APPLE_KEY_GENERATION_DATE}`;
    const dismissed = localStorage.getItem(dismissKey);

    if (dismissed && !expired) {
      return undefined;
    }

    toast(
      expired
        ? "Apple Sign-In credential expired"
        : "Apple Sign-In credential expires soon",
      {
        id: TOAST_ID,
        description: getAppleKeyExpiryMessage(),
        duration: Infinity,
        cancel: {
          label: "Dismiss",
          onClick: () => {
            localStorage.setItem(dismissKey, new Date().toISOString());
          },
        },
      },
    );

    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, [isAdmin]);

  return null;
}
