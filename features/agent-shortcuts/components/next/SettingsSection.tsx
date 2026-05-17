"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VARIABLE_PANEL_STYLE_OPTIONS,
  type VariablesPanelStyle,
} from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";

/**
 * Shortcut settings panel — progressive disclosure.
 *
 *   Auto Run
 *     ├─ Show Pre-Execution Gate     (only when Auto Run is on)
 *     │   └─ Pre-Execution Message   (only when the gate is on)
 *   Variable Panel Style             (with "Hide" option — replaces the
 *                                     separate Show Variable Panel toggle)
 *   Allow Chat
 *   Show Definition Messages
 *     └─ Show Definition Content     (only when defs are shown)
 *   Hide Reasoning
 *   Hide Tool Results
 *   ──────── Advanced ────────       (collapsed by default)
 */

/** Fields on AgentShortcut that this section reads / writes. */
export type SettingsFields = Pick<
  AgentShortcut,
  | "autoRun"
  | "showPreExecutionGate"
  | "preExecutionMessage"
  | "showVariablePanel"
  | "variablesPanelStyle"
  | "allowChat"
  | "showDefinitionMessages"
  | "showDefinitionMessageContent"
  | "hideReasoning"
  | "hideToolResults"
>;

const HIDDEN_PANEL_STYLE = "__hidden__" as const;

export function SettingsSection({
  value,
  onChange,
  disabled,
}: {
  value: SettingsFields;
  onChange: <K extends keyof SettingsFields>(
    field: K,
    next: SettingsFields[K],
  ) => void;
  disabled?: boolean;
}) {
  // Variable Panel Style derives from two underlying fields. "Hide"
  // collapses showVariablePanel=false; any other value flips it on.
  const panelStyleSelectValue: VariablesPanelStyle | typeof HIDDEN_PANEL_STYLE =
    value.showVariablePanel ? value.variablesPanelStyle : HIDDEN_PANEL_STYLE;

  const onPanelStyleChange = (next: string) => {
    if (next === HIDDEN_PANEL_STYLE) {
      onChange("showVariablePanel", false);
      return;
    }
    onChange("showVariablePanel", true);
    onChange("variablesPanelStyle", next as VariablesPanelStyle);
  };

  return (
    <div className="space-y-1">
      <ToggleRow
        title="Auto run"
        hint="Submit the agent automatically when the shortcut fires."
        checked={value.autoRun}
        onChange={(v) => onChange("autoRun", v)}
        disabled={disabled}
      />

      {value.autoRun && (
        <Indent>
          <ToggleRow
            title="Show pre-execution gate"
            hint="Show a confirmation step before the auto-run fires."
            checked={value.showPreExecutionGate}
            onChange={(v) => onChange("showPreExecutionGate", v)}
            disabled={disabled}
          />
          {value.showPreExecutionGate && (
            <Indent>
              <FieldRow
                title="Pre-execution message"
                hint="Text shown to the user during the confirmation step."
              >
                <Input
                  value={value.preExecutionMessage ?? ""}
                  onChange={(e) =>
                    onChange("preExecutionMessage", e.target.value || null)
                  }
                  placeholder="Click anywhere to cancel; runs in 3s…"
                  disabled={disabled}
                  className="h-9 text-sm"
                  style={{ fontSize: "16px" }}
                />
              </FieldRow>
            </Indent>
          )}
        </Indent>
      )}

      <FieldRow
        title="Variable panel"
        hint="How the user supplies variable values before / during the run."
      >
        <Select
          value={panelStyleSelectValue}
          onValueChange={onPanelStyleChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 text-sm w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={HIDDEN_PANEL_STYLE}>Hide</SelectItem>
            {VARIABLE_PANEL_STYLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <ToggleRow
        title="Allow chat"
        hint="Permit the user to continue the conversation after the initial run."
        checked={value.allowChat}
        onChange={(v) => onChange("allowChat", v)}
        disabled={disabled}
      />

      <ToggleRow
        title="Show definition messages"
        hint="Render the agent's instruction / system messages in the result UI."
        checked={value.showDefinitionMessages}
        onChange={(v) => onChange("showDefinitionMessages", v)}
        disabled={disabled}
      />
      {value.showDefinitionMessages && (
        <Indent>
          <ToggleRow
            title="Show definition content"
            hint="Also reveal the body of each definition message (not just titles)."
            checked={value.showDefinitionMessageContent}
            onChange={(v) => onChange("showDefinitionMessageContent", v)}
            disabled={disabled}
          />
        </Indent>
      )}

      <ToggleRow
        title="Hide reasoning"
        hint="Suppress the agent's intermediate reasoning blocks from the output."
        checked={value.hideReasoning}
        onChange={(v) => onChange("hideReasoning", v)}
        disabled={disabled}
      />

      <ToggleRow
        title="Hide tool results"
        hint="Suppress tool-call outputs from the output."
        checked={value.hideToolResults}
        onChange={(v) => onChange("hideToolResults", v)}
        disabled={disabled}
      />
    </div>
  );
}

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

function Indent({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-4 pl-3 border-l border-border/70 space-y-1">
      {children}
    </div>
  );
}
