"use client";

/**
 * AddRuleWindow — the "Add rule" WindowPanel for a Rulebook (Arman,
 * 2026-08-17: window panels over blocking modals; project-new is the
 * exemplar). Chrome only: the body is the canonical
 * `features/masterwork/components/add-rule/AddRulePanel` (With AI — the
 * default — and Manually). Open it through `useOpenAddRuleWindow()`, never a
 * raw `openOverlay` dispatch.
 */

import React, { useEffect, useRef } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AddRulePanel } from "@/features/masterwork/components/add-rule/AddRulePanel";
import { emitAddRuleEvent, type AddRuleWindowData } from "./callbacks";

const OVERLAY_ID = "masterworkAddRuleWindow";

export interface AddRuleWindowProps extends AddRuleWindowData {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddRuleWindow({
  isOpen,
  onClose,
  callbackGroupId,
  rulebookId,
  defaultSection,
}: AddRuleWindowProps) {
  const callbackGroupRef = useRef(callbackGroupId);
  useEffect(() => {
    callbackGroupRef.current = callbackGroupId;
  }, [callbackGroupId]);

  // Emit window-close exactly once, on unmount — covers X, Esc, programmatic.
  useEffect(
    () => () => {
      emitAddRuleEvent(callbackGroupRef.current, { type: "window-close" });
    },
    [],
  );

  if (!isOpen || !rulebookId) return null;

  return (
    <WindowPanel
      title="Add a rule"
      id="masterwork-add-rule-window"
      overlayId={OVERLAY_ID}
      minWidth={480}
      minHeight={420}
      width={680}
      height="82dvh"
      position="center"
      onClose={onClose}
      bodyClassName="flex-1 min-h-0 overflow-hidden"
    >
      <AddRulePanel
        rulebookId={rulebookId}
        defaultSection={defaultSection ?? null}
        onAdded={(rule, rulebook) =>
          emitAddRuleEvent(callbackGroupRef.current, {
            type: "added",
            rule,
            rulebook,
          })
        }
      />
    </WindowPanel>
  );
}
