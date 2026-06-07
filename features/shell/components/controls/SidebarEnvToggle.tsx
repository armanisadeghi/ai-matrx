"use client";

import { Server } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveServer,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";

export default function SidebarEnvToggle() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const activeServer = useAppSelector(selectActiveServer);

  if (!isAdmin) return null;

  const isLocalhost = activeServer === "localhost";
  // console.log("isLocalhost", isLocalhost);
  // console.log("activeServer", activeServer);

  const handleToggle = () => {
    dispatch(switchServer({ env: isLocalhost ? "production" : "localhost" }));
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="shell-nav-item shell-tactile"
      style={isLocalhost ? { color: "#facc15" } : undefined}
      aria-pressed={isLocalhost}
      aria-label={isLocalhost ? "Switch to production" : "Switch to localhost"}
      title={
        isLocalhost
          ? "Using: Localhost → click to switch to Production"
          : "Using: Production → click to switch to Localhost"
      }
    >
      <span
        className="shell-nav-icon"
        style={isLocalhost ? { color: "#facc15" } : undefined}
      >
        <Server size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">
        {isLocalhost ? "Localhost" : "Production"}
      </span>
    </button>
  );
}
