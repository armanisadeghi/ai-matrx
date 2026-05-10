"use client";

/**
 * SlotOverrideEditor — Tier-2 slot override surface for the Settings
 * Layout tab.
 *
 * For each slot the active shell exposes (from SHELL_SLOT_CATALOG), the
 * editor renders a row with: a toggle that flips
 * `slot_overrides[slot]` between 'default' and 'custom', and — when
 * custom — a code area with the slot's source.
 *
 * Edits are kept local until the user hits "Save"; this avoids saving on
 * every keystroke against the JSONB column. Toggling override on
 * pre-fills the editor with the matching stub from SLOT_STUBS so users
 * have a working starting point.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SLOT_STUBS,
  getSlotsForShell,
} from "@/features/agent-apps/utils/slot-stubs";
import type {
  AgentAppShellKind,
  AgentAppSlotCode,
  AgentAppSlotName,
  AgentAppSlotOverrides,
} from "@/features/agent-apps/types";

interface SlotOverrideEditorProps {
  shellKind: AgentAppShellKind;
  overrides: AgentAppSlotOverrides;
  code: AgentAppSlotCode;
  onChangeOverrides: (next: AgentAppSlotOverrides) => Promise<void> | void;
  onChangeCode: (next: AgentAppSlotCode) => Promise<void> | void;
  disabled?: boolean;
}

export function SlotOverrideEditor({
  shellKind,
  overrides,
  code,
  onChangeOverrides,
  onChangeCode,
  disabled,
}: SlotOverrideEditorProps) {
  const slots = useMemo(() => getSlotsForShell(shellKind), [shellKind]);

  if (slots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        This shell has no overridable slots.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Slot overrides
        </Label>
        <p className="text-xs text-muted-foreground mt-1">
          Replace any slot with custom React code. Default slots remain in
          place until overridden.
        </p>
      </div>

      <div className="space-y-2">
        {slots.map((slot) => (
          <SlotRow
            key={slot.name}
            slotName={slot.name}
            slotLabel={slot.label}
            slotDescription={slot.description}
            isCustom={overrides[slot.name] === "custom"}
            currentCode={code[slot.name] ?? ""}
            onToggle={async (next) => {
              const updatedOverrides = { ...overrides };
              if (next) {
                updatedOverrides[slot.name] = "custom";
                await onChangeOverrides(updatedOverrides);
                if (!code[slot.name]) {
                  await onChangeCode({
                    ...code,
                    [slot.name]: SLOT_STUBS[slot.name],
                  });
                }
              } else {
                delete updatedOverrides[slot.name];
                await onChangeOverrides(updatedOverrides);
              }
            }}
            onSaveCode={async (next) => {
              await onChangeCode({ ...code, [slot.name]: next });
            }}
            onResetCode={async () => {
              await onChangeCode({
                ...code,
                [slot.name]: SLOT_STUBS[slot.name],
              });
            }}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

interface SlotRowProps {
  slotName: AgentAppSlotName;
  slotLabel: string;
  slotDescription: string;
  isCustom: boolean;
  currentCode: string;
  onToggle: (next: boolean) => Promise<void> | void;
  onSaveCode: (code: string) => Promise<void> | void;
  onResetCode: () => Promise<void> | void;
  disabled?: boolean;
}

function SlotRow({
  slotLabel,
  slotDescription,
  isCustom,
  currentCode,
  onToggle,
  onSaveCode,
  onResetCode,
  disabled,
}: SlotRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(currentCode);
  const [saving, setSaving] = useState(false);

  // When the saved code changes externally (toggle, reset), sync the draft.
  useEffect(() => {
    setDraft(currentCode);
  }, [currentCode]);

  const isDirty = draft !== currentCode;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveCode(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await onResetCode();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card overflow-hidden",
        isCustom && "border-primary/50",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {slotLabel}
          </div>
          <div className="text-xs text-muted-foreground leading-snug">
            {slotDescription}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCustom && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              disabled={disabled}
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide code
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Edit code
                </>
              )}
            </button>
          )}
          <Switch
            checked={isCustom}
            onCheckedChange={(v) => onToggle(v)}
            disabled={disabled}
          />
        </div>
      </div>

      {isCustom && expanded && (
        <div className="border-t border-border/60 p-3 space-y-2 bg-muted/20">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled || saving}
            spellCheck={false}
            rows={14}
            className="font-mono text-[12px] leading-relaxed bg-background"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={disabled || saving}
              className="gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to stub
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={disabled || saving || !isDirty}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
