"use client";

import { useEffect, useRef } from "react";
import { Server } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  checkServerHealth,
  selectActiveServer,
  selectActiveServerHealth,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";

const HEALTHY_CHECK_INTERVAL_MS = 60_000;
const UNHEALTHY_CHECK_INTERVAL_MS = 15_000;

export default function SidebarEnvToggle() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const activeServer = useAppSelector(selectActiveServer);
  const activeHealth = useAppSelector(selectActiveServerHealth);
  const healthStatusRef = useRef(activeHealth.status);

  // Keep the polling callback aware of the latest completed health result
  // without recreating the timer while a request is in progress.
  useEffect(() => {
    healthStatusRef.current = activeHealth.status;
  }, [activeHealth.status]);

  const isLocalhost = activeServer === "localhost";

  useEffect(() => {
    if (!isAdmin || !isLocalhost) return;

    const intervalMs =
      healthStatusRef.current === "unhealthy"
        ? UNHEALTHY_CHECK_INTERVAL_MS
        : HEALTHY_CHECK_INTERVAL_MS;

    // A completed check updates lastCheckedAt, which creates the next timer.
    // This guarantees one timer at a time: healthy localhost is checked every
    // minute, while an unhealthy localhost is retried every 15 seconds.
    const timeoutId = window.setTimeout(() => {
      dispatch(checkServerHealth({ env: "localhost", force: true }));
    }, intervalMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeHealth.lastCheckedAt, dispatch, isAdmin, isLocalhost]);

  if (!isAdmin) return null;

  const isLocalhostUnhealthy =
    isLocalhost && activeHealth.status === "unhealthy";
  const localhostColor = isLocalhostUnhealthy ? "#f97316" : "#facc15";

  const handleToggle = () => {
    dispatch(switchServer({ env: isLocalhost ? "production" : "localhost" }));
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="shell-nav-item shell-tactile"
      style={isLocalhost ? { color: localhostColor } : undefined}
      aria-pressed={isLocalhost}
      aria-label={isLocalhost ? "Switch to production" : "Switch to localhost"}
      title={
        isLocalhost
          ? isLocalhostUnhealthy
            ? "Localhost is unavailable → checking every 15 seconds; click to switch to Production"
            : "Using: Localhost → checking every minute; click to switch to Production"
          : "Using: Production → click to switch to Localhost"
      }
    >
      <span
        className="shell-nav-icon"
        style={isLocalhost ? { color: localhostColor } : undefined}
      >
        <Server size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">
        {isLocalhost ? "Localhost" : "Production"}
      </span>
    </button>
  );
}
