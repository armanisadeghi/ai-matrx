"use client";

// features/crm/pre-send-check/usePreSendCheck.ts
//
// Run the pre-send check on demand and hold its report. A failed call is an
// error the panel shows; it never disables the caller's action.

import { useCallback, useRef, useState } from "react";
import {
  runPreSendCheck,
  type PreSendCheckReport,
  type PreSendCheckRequest,
} from "./service";

export interface PreSendCheckState {
  report: PreSendCheckReport | null;
  running: boolean;
  error: string | null;
  run: (request: PreSendCheckRequest) => Promise<PreSendCheckReport | null>;
  reset: () => void;
}

export function usePreSendCheck(organizationId: string): PreSendCheckState {
  const [report, setReport] = useState<PreSendCheckReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const run = useCallback(
    async (request: PreSendCheckRequest) => {
      const ticket = ++latest.current;
      setRunning(true);
      setError(null);
      try {
        const next = await runPreSendCheck(organizationId, request);
        if (ticket === latest.current) setReport(next);
        return next;
      } catch (failure) {
        if (ticket === latest.current) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
        return null;
      } finally {
        if (ticket === latest.current) setRunning(false);
      }
    },
    [organizationId],
  );

  const reset = useCallback(() => {
    latest.current += 1;
    setReport(null);
    setError(null);
    setRunning(false);
  }, []);

  return { report, running, error, run, reset };
}
