"use client";

import { Input } from "@ai-matrx/design-system";
import { FieldHelp } from "@/components/official/ConfigurationFields";
import styles from "./SettingsSection.module.css";
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

/**
 * THE SECTION'S OWN WORDS. The mechanic is one; the nouns belong to whoever
 * hosts it. This panel is mounted by the Gen-A shortcut editor AND by the one
 * binding UI's OPTIONS drawer, where "shortcut" is simply the wrong word for
 * what the person is looking at. Same prop pattern the shared binding row and
 * the AI-map tab already use (`SurfaceVariableBinding.sourceLabels`,
 * `BindingSuggestionsTab.words`) — a second call site, never a second
 * component. Defaults are the shortcut wording verbatim, so the shortcut
 * editor passes nothing and renders exactly what it always rendered.
 */
export interface SettingsSectionWords {
  /** What fires the run, in the host's noun. */
  autoRunHint: string;
}

export const SHORTCUT_SETTINGS_WORDS: SettingsSectionWords = {
  autoRunHint: "Submit the agent automatically when the shortcut fires.",
};

export function SettingsSection({
  value,
  onChange,
  disabled,
  omitAutoRun = false,
  words,
  section,
  fieldMeta,
}: {
  section?: "display" | "overrides" | "permissions";
  fieldMeta?: (field: keyof SettingsFields) => {
    source: string;
    state: string;
  };
  value: SettingsFields;
  onChange: <K extends keyof SettingsFields>(
    field: K,
    next: SettingsFields[K],
  ) => void;
  disabled?: boolean;
  /** This host's nouns. Omit for the shortcut wording. */
  words?: Partial<SettingsSectionWords>;
  /**
   * Hide the auto-run row AND its gate cascade, for a host that already owns
   * that promise elsewhere on the same screen.
   *
   * 🚨 The one binding UI's `AutoRunBar` is such a host: on a job, "run
   * instantly" is not a preference but a FACT about the mapping, narrated as
   * the map changes, refused at the write and re-checked by the resolver
   * (`mandate.binding.auto_run`). A second switch for it inside OPTIONS would be
   * two controls for one answer, and the loser would be silently ignored. The
   * shortcut editor passes nothing and is unchanged.
   */
  omitAutoRun?: boolean;
}) {
  const w = { ...SHORTCUT_SETTINGS_WORDS, ...words };
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
      {!omitAutoRun && !section && (
        <ShortcutToggleRow
          title="Auto run"
          {...fieldMeta?.("autoRun")}
          hint={w.autoRunHint}
          checked={value.autoRun}
          onChange={(v) => onChange("autoRun", v)}
          disabled={disabled}
        />
      )}

      {/* The GATE is presentation, not the promise: it is what the person sees
          in the moment an auto-run fires. So it survives `omitAutoRun` — the
          host that owns the promise still passes the current `autoRun` fact,
          and the gate is offered exactly while that fact makes it meaningful. */}
      {(value.autoRun || section === "display") &&
        section !== "overrides" &&
        section !== "permissions" && (
          <Indent flat={Boolean(section)}>
            <ShortcutToggleRow
              title="Show pre-execution gate"
              {...fieldMeta?.("showPreExecutionGate")}
              hint="Show a confirmation step before the auto-run fires."
              checked={value.showPreExecutionGate}
              onChange={(v) => onChange("showPreExecutionGate", v)}
              disabled={disabled || !value.autoRun}
            />
            {(value.showPreExecutionGate || section === "display") && (
              <Indent flat={Boolean(section)}>
                <ShortcutFieldRow
                  title="Pre-execution message"
                  {...fieldMeta?.("preExecutionMessage")}
                  hint="Text shown to the user during the confirmation step."
                >
                  <Input
                    value={value.preExecutionMessage ?? ""}
                    onChange={(e) =>
                      onChange("preExecutionMessage", e.target.value || null)
                    }
                    placeholder={
                      section
                        ? "Not set"
                        : "Click anywhere to cancel; runs in 3s…"
                    }
                    aria-label="Pre-execution message"
                    disabled={
                      disabled || !value.autoRun || !value.showPreExecutionGate
                    }
                    className="h-9 text-sm"
                    style={{ fontSize: "16px" }}
                  />
                </ShortcutFieldRow>
              </Indent>
            )}
          </Indent>
        )}

      <div hidden={section === "overrides" || section === "permissions"}>
        <ShortcutFieldRow
          title="Variable panel"
          {...fieldMeta?.("variablesPanelStyle")}
          hint="How the user supplies variable values before / during the run."
        >
          <Select
            value={panelStyleSelectValue}
            onValueChange={onPanelStyleChange}
            disabled={disabled}
          >
            <SelectTrigger
              aria-label="Variable panel style"
              className="h-9 text-sm w-full"
            >
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
        </ShortcutFieldRow>

        <ShortcutToggleRow
          title="Allow chat"
          {...fieldMeta?.("allowChat")}
          hint="Permit the user to continue the conversation after the initial run."
          checked={value.allowChat}
          onChange={(v) => onChange("allowChat", v)}
          disabled={disabled}
        />

        <ShortcutToggleRow
          title="Show definition messages"
          {...fieldMeta?.("showDefinitionMessages")}
          hint="Render the agent's instruction / system messages in the result UI."
          checked={value.showDefinitionMessages}
          onChange={(v) => onChange("showDefinitionMessages", v)}
          disabled={disabled}
        />
        {(value.showDefinitionMessages || section === "display") && (
          <Indent flat={Boolean(section)}>
            <ShortcutToggleRow
              title="Show definition content"
              {...fieldMeta?.("showDefinitionMessageContent")}
              hint="Also reveal the body of each definition message (not just titles)."
              checked={value.showDefinitionMessageContent}
              onChange={(v) => onChange("showDefinitionMessageContent", v)}
              disabled={disabled}
            />
          </Indent>
        )}

        <ShortcutToggleRow
          title={section ? "Show reasoning" : "Hide reasoning"}
          {...fieldMeta?.("hideReasoning")}
          hint={
            section
              ? "Display reasoning blocks in the result."
              : "Suppress the agent's intermediate reasoning blocks from the output."
          }
          checked={section ? !value.hideReasoning : value.hideReasoning}
          onChange={(v) => onChange("hideReasoning", section ? !v : v)}
          disabled={disabled}
        />

        <ShortcutToggleRow
          title={section ? "Show tool results" : "Hide tool results"}
          {...fieldMeta?.("hideToolResults")}
          hint={
            section
              ? "Display tool-call results in the output."
              : "Suppress tool-call outputs from the output."
          }
          checked={section ? !value.hideToolResults : value.hideToolResults}
          onChange={(v) => onChange("hideToolResults", section ? !v : v)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function ShortcutToggleRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
  source,
  state,
}: {
  source?: string;
  state?: string;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  if (source)
    return (
      <ShortcutFieldRow title={title} source={source} state={state} hint={hint}>
        <div className="flex items-center gap-2">
          <Switch
            aria-label={title}
            checked={checked}
            onCheckedChange={onChange}
            disabled={disabled}
          />
          <span className="text-sm">{checked ? "Yes" : "No"}</span>
        </div>
      </ShortcutFieldRow>
    );
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          {hint}
        </p>
      </div>
      <Switch
        aria-label={title}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}

export function ShortcutFieldRow({
  title,
  hint,
  children,
  source,
  state,
  hidden,
  metadata,
}: {
  hidden?: boolean;
  metadata?: React.ReactNode;
  source?: string;
  state?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  if (source)
    return (
      <div hidden={hidden} className={styles.row}>
        <div className={styles.label}>
          <span>{title}</span>
          {hint && <FieldHelp label={title}>{hint}</FieldHelp>}
        </div>
        <div className={styles.control}>{children}</div>
        <div className={styles.metadata}>
          {metadata ?? (
            <>
              <span>
                <strong>Source:</strong> {source}
              </span>
              {state && (
                <span>
                  <strong>State:</strong> {state}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  return (
    <div hidden={hidden} className="py-2.5 space-y-1.5">
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

function Indent({
  children,
  flat,
}: {
  children: React.ReactNode;
  flat?: boolean;
}) {
  if (flat) return <div>{children}</div>;
  return (
    <div className="ml-4 pl-3 border-l border-border/70 space-y-1">
      {children}
    </div>
  );
}
