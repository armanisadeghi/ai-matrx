"use client";

// features/admin/applications/config/components/FlagsEditor.tsx
//
// Boolean feature-flag editor for AppConfigV1.flags: key → Switch rows with
// add/remove. Non-boolean flag values (corrupt per schema v1) are surfaced
// loudly and preserved verbatim on save unless explicitly removed here.

import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface FlagsEditorProps {
  flags: Record<string, boolean>;
  malformedFlags: Record<string, unknown>;
  onChange: (flags: Record<string, boolean>) => void;
  onRemoveMalformed: (key: string) => void;
}

const FLAG_KEY_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function FlagsEditor({
  flags,
  malformedFlags,
  onChange,
  onRemoveMalformed,
}: FlagsEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const flagEntries = Object.entries(flags).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const malformedEntries = Object.entries(malformedFlags);

  const addFlag = () => {
    const key = newKey.trim();
    if (!FLAG_KEY_REGEX.test(key)) {
      setAddError(
        "Flag keys are alphanumeric with _ . - separators (no spaces)",
      );
      return;
    }
    if (key in flags || key in malformedFlags) {
      setAddError(`Flag "${key}" already exists`);
      return;
    }
    onChange({ ...flags, [key]: false });
    setNewKey("");
    setAddError(null);
  };

  const removeFlag = (key: string) => {
    const next = { ...flags };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {flagEntries.length === 0 && malformedEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No flags set. Flags are remote kill-switches read by every installed
          client.
        </p>
      ) : null}

      {flagEntries.map(([key, enabled]) => (
        <div
          key={key}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5"
        >
          <code className="truncate text-sm">{key}</code>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {enabled ? "on" : "off"}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) =>
                onChange({ ...flags, [key]: checked })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeFlag(key)}
              aria-label={`Remove flag ${key}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      {malformedEntries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-center justify-between gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 px-3 py-1.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <code className="truncate text-sm">{key}</code>
            <span className="truncate text-xs text-amber-600 dark:text-amber-400">
              non-boolean value ({JSON.stringify(value)}) — schema v1 requires
              booleans; preserved as-is on save (never blocks Save)
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemoveMalformed(key)}
            aria-label={`Remove malformed flag ${key}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newKey}
          onChange={(e) => {
            setNewKey(e.target.value);
            setAddError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFlag();
            }
          }}
          placeholder="new_flag_key"
          className="h-8 max-w-xs font-mono text-sm"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addFlag}
          disabled={newKey.trim().length === 0}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add flag
        </Button>
      </div>
      {addError ? <p className="text-xs text-destructive">{addError}</p> : null}
    </div>
  );
}
