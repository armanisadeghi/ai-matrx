"use client";

// SidebarApiVersionToggle — admin-only switch for the AI runtime API version
// (v1 legacy ⇄ v2 spine). Sits next to SidebarEnvToggle (localhost/production)
// and behaves the same way: a single click flips the value, it tracks the ACTUAL
// effective version, and the choice persists across reloads.
//
// v2 is the app-wide default (AI_API_VERSION_DEFAULT). Flipping to v1 is the
// instant, no-deploy revert if the spine ever misbehaves. Scoped to the four
// covered AI surfaces only — see lib/api/ai-api-version.ts.

import { Layers } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAiApiVersion,
  setAiApiVersion,
} from "@/lib/redux/slices/apiConfigSlice";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";

export default function SidebarApiVersionToggle() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);
  const aiApiVersion = useAppSelector(selectAiApiVersion);

  if (!isAdmin) return null;

  const isV1 = aiApiVersion === "v1";

  const handleToggle = () => {
    // Set an explicit override to the opposite version (persists like the
    // server toggle). v1 is the non-default "attention" state, highlighted.
    dispatch(setAiApiVersion(isV1 ? "v2" : "v1"));
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="shell-nav-item shell-tactile"
      style={isV1 ? { color: "#facc15" } : undefined}
      aria-pressed={isV1}
      aria-label={
        isV1 ? "Switch AI runtime to v2" : "Switch AI runtime to v1"
      }
      title={
        isV1
          ? "AI runtime: v1 (legacy) → click to switch to v2"
          : "AI runtime: v2 (spine) → click to switch to v1"
      }
    >
      <span
        className="shell-nav-icon"
        style={isV1 ? { color: "#facc15" } : undefined}
      >
        <Layers size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">{isV1 ? "AI v1" : "AI v2"}</span>
    </button>
  );
}
