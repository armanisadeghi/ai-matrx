"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  acknowledgeRetiredEc2ApiSelectionNotice,
  selectRetiredEc2ApiSelectionNotice,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  acknowledgeRetiredEc2ServerOverrideNotice,
  migrateRetiredEc2ServerOverride,
  selectRetiredEc2ServerOverride,
  selectRetiredEc2ServerOverrideNotice,
} from "@/lib/redux/preferences/adminPreferencesSlice";

/**
 * Delivers the one-time, persisted explanation for a browser whose retired
 * full-AI API selection was migrated to the canonical production API.
 */
export function RetiredApiSelectionNotice() {
  const dispatch = useAppDispatch();
  const apiConfigShouldNotify = useAppSelector(
    selectRetiredEc2ApiSelectionNotice,
  );
  const staleAdminOverride = useAppSelector(selectRetiredEc2ServerOverride);
  const adminOverrideShouldNotify = useAppSelector(
    selectRetiredEc2ServerOverrideNotice,
  );
  const notifiedCurrentEpisode = useRef(false);

  useEffect(() => {
    if (staleAdminOverride) dispatch(migrateRetiredEc2ServerOverride());
  }, [dispatch, staleAdminOverride]);

  useEffect(() => {
    const hasPendingNotice =
      apiConfigShouldNotify || adminOverrideShouldNotify;
    if (!hasPendingNotice) {
      notifiedCurrentEpisode.current = false;
      return;
    }
    if (!notifiedCurrentEpisode.current) {
      notifiedCurrentEpisode.current = true;
      toast.warning("The retired EC2 AI API selection was replaced with Production.", {
        description: "AI requests now use server.app.matrxserver.com.",
      });
    }
    if (apiConfigShouldNotify) {
      dispatch(acknowledgeRetiredEc2ApiSelectionNotice());
    }
    if (adminOverrideShouldNotify) {
      dispatch(acknowledgeRetiredEc2ServerOverrideNotice());
    }
  }, [adminOverrideShouldNotify, apiConfigShouldNotify, dispatch]);

  return null;
}
