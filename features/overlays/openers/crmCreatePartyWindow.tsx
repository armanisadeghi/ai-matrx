"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { PartyKind } from "@/features/crm/types";

const OVERLAY_ID = "crmCreatePartyWindow" as const;

export interface OpenCrmCreatePartyWindowOptions {
  initialKind?: PartyKind;
  initialOrgId?: string | null;
}

export interface CrmCreatePartyWindowHandle {
  close: () => void;
}

export function useOpenCrmCreatePartyWindow() {
  const dispatch = useAppDispatch();
  return (
    options: OpenCrmCreatePartyWindowOptions = {},
  ): CrmCreatePartyWindowHandle => {
    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        data: {
          initialKind: options.initialKind,
          initialOrgId: options.initialOrgId,
        },
      }),
    );
    return {
      close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
    };
  };
}

export function CrmCreatePartyWindowController(
  props: OpenCrmCreatePartyWindowOptions,
): null {
  const open = useOpenCrmCreatePartyWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialKind, props.initialOrgId]);
  return null;
}
