"use client";

import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  acknowledgeRetiredEc2ApiSelectionNotice,
  selectRetiredEc2ApiSelectionNotice,
} from "@/lib/redux/slices/apiConfigSlice";

/**
 * Delivers the one-time, persisted explanation for a browser whose retired
 * full-AI API selection was migrated to the canonical production API.
 */
export function RetiredApiSelectionNotice() {
  const dispatch = useAppDispatch();
  const shouldNotify = useAppSelector(selectRetiredEc2ApiSelectionNotice);

  useEffect(() => {
    if (!shouldNotify) return;
    toast.warning("The retired EC2 AI API selection was replaced with Production.", {
      description: "AI requests now use server.app.matrxserver.com.",
    });
    dispatch(acknowledgeRetiredEc2ApiSelectionNotice());
  }, [dispatch, shouldNotify]);

  return null;
}
