"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/styles/themes/utils";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";

/**
 * Bottom-of-page Advanced fold. Covers every `agx_shortcut` column
 * that didn't earn a place in the main Settings section — the rare,
 * power-user knobs the user shouldn't see by default but mustn't lose.
 *
 *   • Active                       (boolean)
 *   • Internal description         (text)
 *   • Icon name                    (lucide)
 *   • Keyboard shortcut            (text)
 *   • Sort order                   (int)
 *   • Default user input           (text)
 *   • Response density             (enum)
 *   • Bypass gate seconds          (int, only when the gate is enabled)
 *   • Default variables            (jsonb)
 *   • Context overrides            (jsonb)
 *   • LLM overrides                (jsonb)
 *   • JSON extraction              (jsonb)
 */

export type AdvancedFields = Pick<
  AgentShortcut,
  | "isActive"
  | "description"
  | "iconName"
  | "keyboardShortcut"
  | "sortOrder"
  | "defaultUserInput"
  | "responseDensity"
  | "autoRun"
  | "showPreExecutionGate"
  | "bypassGateSeconds"
  | "defaultVariables"
  | "contextOverrides"
  | "llmOverrides"
  | "jsonExtraction"
>;

export function AdvancedSection({
  value,
  onChange,
  disabled,
}: {
  value: AdvancedFields;
  onChange: <K extends keyof AdvancedFields>(
    field: K,
    next: AdvancedFields[K],
  ) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 py-1.5 text-sm font-semibold text-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")}
        />
        Advanced
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          Power-user knobs you rarely need to touch.
        </span>
      </button>

      {open && (
        <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-4">
          <ToggleRow
            title="Active"
            hint="Inactive shortcuts are hidden from menus but kept in the DB."
            checked={value.isActive}
            onChange={(v) => onChange("isActive", v)}
            disabled={disabled}
          />

          <FieldRow
            title="Internal description"
            hint="Notes for admins. Not shown to end users."
          >
            <Textarea
              value={value.description ?? ""}
              onChange={(e) => onChange("description", e.target.value || null)}
              rows={2}
              placeholder="What this shortcut does"
              disabled={disabled}
              className="text-sm resize-none"
              style={{ fontSize: "16px" }}
            />
          </FieldRow>

          <FieldRow
            title="Icon"
            hint="Pick from the curated gallery or enter a Lucide icon name."
          >
            <IconInputWithValidation
              value={value.iconName ?? ""}
              onChange={(next) => onChange("iconName", next || null)}
              placeholder="e.g. Sparkles, Flame, svg:icons/Home"
              disabled={disabled}
              showLucideLink
              showCuratedIconGallery
            />
          </FieldRow>

          <FieldRow title="Keyboard shortcut" hint="e.g. Cmd+Shift+K">
            <Input
              value={value.keyboardShortcut ?? ""}
              onChange={(e) =>
                onChange("keyboardShortcut", e.target.value || null)
              }
              placeholder="None"
              disabled={disabled}
              className="h-9 text-sm"
              style={{ fontSize: "16px" }}
            />
          </FieldRow>

          <FieldRow title="Sort order" hint="Lower numbers appear first.">
            <Input
              type="number"
              value={value.sortOrder}
              onChange={(e) =>
                onChange("sortOrder", Number(e.target.value) || 0)
              }
              disabled={disabled}
              className="h-9 text-sm w-32"
            />
          </FieldRow>

          <FieldRow
            title="Default user input"
            hint="Pre-fills the user message box on launch."
          >
            <Textarea
              value={value.defaultUserInput ?? ""}
              onChange={(e) =>
                onChange("defaultUserInput", e.target.value || null)
              }
              rows={2}
              placeholder="Hello"
              disabled={disabled}
              className="text-sm resize-none"
              style={{ fontSize: "16px" }}
            />
          </FieldRow>

          <FieldRow
            title="Response density"
            hint="Visual density of the result UI."
          >
            <Select
              value={value.responseDensity}
              onValueChange={(v) =>
                onChange("responseDensity", v as "comfortable" | "compact")
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          {value.autoRun && value.showPreExecutionGate && (
            <FieldRow
              title="Bypass gate after"
              hint="Auto-confirm the pre-execution gate after N seconds."
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={value.bypassGateSeconds}
                  onChange={(e) =>
                    onChange("bypassGateSeconds", Number(e.target.value) || 0)
                  }
                  disabled={disabled}
                  className="h-9 text-sm w-20"
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </FieldRow>
          )}

          <JsonFieldRow
            title="Default variables"
            hint={`Pre-filled values for the agent variables — overrides each variable's built-in default. Example: { "language": "en" }`}
            value={value.defaultVariables}
            onChange={(v) =>
              onChange(
                "defaultVariables",
                v as AgentShortcut["defaultVariables"],
              )
            }
            disabled={disabled}
            placeholder="{}"
          />

          <JsonFieldRow
            title="Context overrides"
            hint="Per-key values that override what the surface ships into context slots."
            value={value.contextOverrides}
            onChange={(v) =>
              onChange(
                "contextOverrides",
                v as AgentShortcut["contextOverrides"],
              )
            }
            disabled={disabled}
            placeholder="{}"
          />

          <JsonFieldRow
            title="LLM overrides"
            hint='Override LLM parameters for this shortcut. Example: { "temperature": 0.2, "max_output_tokens": 1500 }'
            value={value.llmOverrides}
            onChange={(v) =>
              onChange("llmOverrides", v as AgentShortcut["llmOverrides"])
            }
            disabled={disabled}
            placeholder="{}"
          />

          <JsonFieldRow
            title="JSON extraction"
            hint="Streaming JSON extraction config. NULL = off. See JsonExtractionConfig."
            value={value.jsonExtraction}
            onChange={(v) =>
              onChange("jsonExtraction", v as AgentShortcut["jsonExtraction"])
            }
            disabled={disabled}
            placeholder="null"
          />
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────────

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          {hint}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}

function FieldRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2.5 space-y-1.5">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Free-form JSON editor. Parses on every change so the parent only ever
 * gets a valid value; invalid input shows an inline error and the parent
 * keeps the last good value.
 */
function JsonFieldRow({
  title,
  hint,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  title: string;
  hint: string;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const initial = value == null ? "" : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Sync local draft when the parent reset / loaded a new value.
  useEffect(() => {
    setDraft(value == null ? "" : JSON.stringify(value, null, 2));
    setError(null);
  }, [value]);

  const onTextChange = (next: string) => {
    setDraft(next);
    const trimmed = next.trim();
    if (trimmed === "") {
      setError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <FieldRow title={title} hint={hint}>
      <Textarea
        value={draft}
        onChange={(e) => onTextChange(e.target.value)}
        rows={4}
        placeholder={placeholder}
        disabled={disabled}
        className="text-xs font-mono resize-y"
        style={{ fontSize: "13px" }}
      />
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </FieldRow>
  );
}
