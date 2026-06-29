"use client";

// BottomSheet — iOS-style glass bottom drawer for mobile action overflow.
//
// Glass background, spring animation, backdrop, grabber handle.
// Portaled to document.body to escape any stacking context.
//
// Usage:
//   <BottomSheet
//     open={isOpen}
//     onClose={() => setOpen(false)}
//     actions={[{ icon: "Plus", label: "New", onPress: fn }]}
//   />

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import LucideIcon from "./LucideIcon";
import type { HeaderAction } from "../types";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  actions: HeaderAction[];
  /** Optional title above the action list */
  title?: string;
}

export default function BottomSheet({ open, onClose, actions, title }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    return undefined;
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleActionPress = (action: HeaderAction) => {
    action.onPress();
    onClose();
  };

  return createPortal(
    <div className="hdr-sheet-overlay" onClick={onClose} role="presentation">
      {/* Backdrop */}
      <div className="hdr-sheet-backdrop" />

      {/* Sheet panel — stop propagation so tapping inside doesn't close */}
      <div
        ref={sheetRef}
        className="hdr-sheet-panel matrx-glass-thin-border"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Actions"}
      >
        {/* Grabber handle */}
        <div className="hdr-sheet-handle">
          <div className="hdr-sheet-handle-bar" />
        </div>

        {/* Optional title */}
        {title && <div className="hdr-sheet-title">{title}</div>}

        {/* Action rows */}
        <div className="hdr-sheet-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              className={`hdr-sheet-action-row ${action.destructive ? "hdr-sheet-action-destructive" : ""}`}
              onClick={() => handleActionPress(action)}
              type="button"
            >
              <span className="hdr-sheet-action-icon">
                <LucideIcon name={action.icon} size={20} />
              </span>
              <span className="hdr-sheet-action-label">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Cancel button */}
        <div className="hdr-sheet-cancel-wrap">
          <button className="hdr-sheet-cancel" onClick={onClose} type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
