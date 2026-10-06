"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { useOrganizationCap } from "./useOrganizationCap";

const REMINDED_KEY = "matrx:organization-cap-reminded";

/**
 * A person who already belongs to more organizations than their cap allows is
 * told so on every visit (once per browser session) until they leave or
 * archive enough to get back under it. Nothing is taken away from them.
 */
export function OrganizationCapReminder() {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const { ready, overCap, count, cap } = useOrganizationCap();

  useEffect(() => {
    if (!ready || !overCap || cap === null || !userId) return;
    try {
      if (sessionStorage.getItem(REMINDED_KEY) === userId) return;
      sessionStorage.setItem(REMINDED_KEY, userId);
    } catch {
      // Storage unavailable: remind on this load anyway.
    }
    toast.info("Over your organization limit", {
      description: `In ${count}; your plan allows ${cap}. Leave unused ones.`,
      duration: Infinity,
      action: {
        label: "Manage",
        onClick: () => router.push("/organizations"),
      },
    });
  }, [ready, overCap, count, cap, userId, router]);

  return null;
}
