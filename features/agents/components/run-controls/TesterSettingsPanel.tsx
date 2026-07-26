import { Label } from "@/components/ui/label";
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
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";

// =============================================================================
// Shared settings panel used by both the sidebar and widget-invoker testers.
//
// Pure UI — accepts a `controller` whose shape matches the return of
// `useAgentLauncherTester`. Any host can provide a compatible object (the
// widgets page supplies its own local-state implementation).
//
// Everything is visible at once — no internal collapsibles. Host containers
// already handle the outer collapse behavior if needed.
// =============================================================================

export interface TesterSettingsController {
  // Main
  autoRun: boolean;
  setAutoRun: (v: boolean) => void;
  showVariablePanel: boolean;
  setShowVariablePanel: (v: boolean) => void;
  variablesPanelStyle: VariablesPanelStyle;
  setVariablesPanelStyle: (v: VariablesPanelStyle) => void;
  showPreExecutionGate: boolean;
  setShowPreExecutionGate: (v: boolean) => void;
  preExecutionMessage: string;
  setPreExecutionMessage: (v: string) => void;
  showDefinitionMessages: boolean;
  setShowDefinitionMessages: (v: boolean) => void;
  showDefinitionMessageContent: boolean;
  setShowDefinitionMessageContent: (v: boolean) => void;
  allowChat: boolean;
  setAllowChat: (v: boolean) => void;
  hideReasoning: boolean;
  setHideReasoning: (v: boolean) => void;
  hideToolResults: boolean;
  setHideToolResults: (v: boolean) => void;
  // Editor context (simulated selection)
  /** Gate — when false, the editor fields below are ignored on launch. */
  includeEditorContext: boolean;
  setIncludeEditorContext: (v: boolean) => void;
  editorSelection: string;
  setEditorSelection: (v: string) => void;
  editorTextBefore: string;
  setEditorTextBefore: (v: string) => void;
  editorTextAfter: string;
  setEditorTextAfter: (v: string) => void;
  editorContent: string;
  setEditorContent: (v: string) => void;
  editorContext: string;
  setEditorContext: (v: string) => void;
  // Advanced
  apiEndpointMode: ApiEndpointMode;
  setApiEndpointMode: (v: ApiEndpointMode) => void;
  showAutoClearToggle: boolean;
  setShowAutoClearToggle: (v: boolean) => void;
  autoClearConversation: boolean;
  setAutoClearConversation: (v: boolean) => void;
  jsonExtractionEnabled: boolean;
  setJsonExtractionEnabled: (v: boolean) => void;
  jsonExtractionFuzzy: boolean;
  setJsonExtractionFuzzy: (v: boolean) => void;
  jsonExtractionMaxResults: string;
  setJsonExtractionMaxResults: (v: string) => void;
  overridesJson: string;
  setOverridesJson: (v: string) => void;
  applicationScopeJson: string;
  setApplicationScopeJson: (v: string) => void;
  jsonError: string | null;
}

export interface QuickTestFeaturesController {
  applyVariables: boolean;
  setApplyVariables: (v: boolean) => void;
  applyUserInput: boolean;
  setApplyUserInput: (v: boolean) => void;
  applyAppContext: boolean;
  setApplyAppContext: (v: boolean) => void;
}

// =============================================================================
// Subcomponents
// =============================================================================

function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
  title,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-1" title={title}>
      <Label
        htmlFor={id}
        className={`text-[11px] leading-tight ${
          disabled
            ? "text-muted-foreground cursor-not-allowed"
            : "text-foreground cursor-pointer"
        }`}
        aria-disabled={disabled}
      >
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="scale-75 shrink-0"
      />
    </div>
  );
}

/**
 * Section heading — colored to create a natural visual break between
 * the different groups of controls in the settings list.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2 pb-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-primary">
      {children}
    </div>
  );
}

// =============================================================================
// TesterSettingsPanel
// =============================================================================

interface TesterSettingsPanelProps {
  controller: TesterSettingsController;
  /** Optional — when provided, renders the "Quick Test Features" block. */
  quickTest?: QuickTestFeaturesController;
  /** Prefix for DOM ids so multiple panels can coexist. */
  idPrefix?: string;
}

export function TesterSettingsPanel({
  controller: c,
  quickTest,
  idPrefix = "tester",
}: TesterSettingsPanelProps) {
  return (
    <div className="space-y-2">
      {/* ── General ───────────────────────────────────────────────── */}
      <SectionLabel>General</SectionLabel>

      <SwitchRow
        id={`${idPrefix}-auto-run`}
        label="Auto Run"
        checked={c.autoRun}
        onCheckedChange={c.setAutoRun}
        title="Start execution immediately after launch"
      />
      <SwitchRow
        id={`${idPrefix}-show-variable-panel`}
        label="Show Variables Panel"
        checked={c.showVariablePanel}
        onCheckedChange={c.setShowVariablePanel}
        title="Render the variable input panel inside the widget"
      />

      <div className="flex items-center justify-between gap-1">
        <Label
          htmlFor={`${idPrefix}-variables-panel-style`}
          className={`text-[11px] leading-tight ${
            c.showVariablePanel
              ? "text-foreground cursor-pointer"
              : "text-muted-foreground cursor-not-allowed"
          }`}
          aria-disabled={!c.showVariablePanel}
        >
          Variables Panel Style
        </Label>
        <Select
          value={c.variablesPanelStyle}
          onValueChange={(v) =>
            c.setVariablesPanelStyle(v as VariablesPanelStyle)
          }
          disabled={!c.showVariablePanel}
        >
          <SelectTrigger
            id={`${idPrefix}-variables-panel-style`}
            size="sm"
            className="h-5 min-w-[4.5rem] max-w-[4.5rem] shrink-0 text-[11px] px-1.5"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VARIABLE_PANEL_STYLE_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                title={opt.description}
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SwitchRow
        id={`${idPrefix}-show-pre-execution-gate`}
        label="Show Pre-Execution Gate"
        checked={c.showPreExecutionGate}
        onCheckedChange={c.setShowPreExecutionGate}
        title="Show a gate UI before executing where the user provides initial text"
      />

      {c.showPreExecutionGate && (
        <input
          id={`${idPrefix}-pre-execution-message`}
          type="text"
          value={c.preExecutionMessage}
          onChange={(e) => c.setPreExecutionMessage(e.target.value)}
          placeholder="Pre-execution message"
          className="h-6 w-full rounded-md border border-border bg-background px-2 text-[11px] leading-tight placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      )}

      <SwitchRow
        id={`${idPrefix}-show-definition-messages`}
        label="Show Definition Messages"
        checked={c.showDefinitionMessages}
        onCheckedChange={c.setShowDefinitionMessages}
      />
      <SwitchRow
        id={`${idPrefix}-show-definition-content`}
        label="Show Definition Content"
        checked={c.showDefinitionMessageContent}
        onCheckedChange={c.setShowDefinitionMessageContent}
        title="Reveal raw template content inside definition messages"
      />
      <SwitchRow
        id={`${idPrefix}-allow-chat`}
        label="Allow Chat"
        checked={c.allowChat}
        onCheckedChange={c.setAllowChat}
        title="Permit multi-turn follow-ups after the first response"
      />
      <SwitchRow
        id={`${idPrefix}-hide-reasoning`}
        label="Hide Reasoning"
        checked={c.hideReasoning}
        onCheckedChange={c.setHideReasoning}
      />
      <SwitchRow
        id={`${idPrefix}-hide-tool-results`}
        label="Hide Tool Results"
        checked={c.hideToolResults}
        onCheckedChange={c.setHideToolResults}
      />

      {/* ── Editor Context (gated — defaults OFF so the sample never leaks) */}
      <div className="pt-2 pb-0.5 flex items-center justify-between gap-2">
        <Label
          htmlFor={`${idPrefix}-include-editor-context`}
          className="text-[9.5px] font-semibold uppercase tracking-wider text-primary cursor-pointer"
        >
          Editor Context
        </Label>
        <Switch
          id={`${idPrefix}-include-editor-context`}
          checked={c.includeEditorContext}
          onCheckedChange={c.setIncludeEditorContext}
          className="scale-75 shrink-0"
        />
      </div>

      <div
        className={`space-y-1.5 ${c.includeEditorContext ? "" : "opacity-50"}`}
        aria-disabled={!c.includeEditorContext}
        title={
          c.includeEditorContext
            ? undefined
            : "Turn on the Editor Context switch to include these values in the request"
        }
      >
        <EditorContextField
          id={`${idPrefix}-editor-selection`}
          label="Selection"
          value={c.editorSelection}
          onChange={c.setEditorSelection}
          rows={2}
        />
        <EditorContextField
          id={`${idPrefix}-editor-before`}
          label="Text Before"
          value={c.editorTextBefore}
          onChange={c.setEditorTextBefore}
          rows={2}
        />
        <EditorContextField
          id={`${idPrefix}-editor-after`}
          label="Text After"
          value={c.editorTextAfter}
          onChange={c.setEditorTextAfter}
          rows={2}
        />
        <EditorContextField
          id={`${idPrefix}-editor-content`}
          label="Full Content"
          value={c.editorContent}
          onChange={c.setEditorContent}
          rows={3}
        />
        <EditorContextField
          id={`${idPrefix}-editor-context`}
          label="Context"
          value={c.editorContext}
          onChange={c.setEditorContext}
          rows={2}
        />
      </div>

      {/* ── Quick Test Features (optional) ──────────────────────────── */}
      {quickTest && (
        <>
          <SectionLabel>Quick Test Features</SectionLabel>
          <SwitchRow
            id={`${idPrefix}-apply-variables`}
            label="Apply My Local Variables"
            checked={quickTest.applyVariables}
            onCheckedChange={quickTest.setApplyVariables}
            title="Send the active conversation's resolved variable values"
          />
          <SwitchRow
            id={`${idPrefix}-apply-user-input`}
            label="Apply My Local User Input"
            checked={quickTest.applyUserInput}
            onCheckedChange={quickTest.setApplyUserInput}
            title="Send the active conversation's current user input text"
          />
          <SwitchRow
            id={`${idPrefix}-apply-app-context`}
            label="Apply My Local App Context"
            checked={quickTest.applyAppContext}
            onCheckedChange={quickTest.setApplyAppContext}
            title="Construct an Application Scope from the active state"
          />
        </>
      )}

      {/* ── Advanced Controls ──────────────────────────────────────── */}
      <SectionLabel>Advanced Controls</SectionLabel>

      <div className="flex items-center justify-between gap-1">
        <Label
          htmlFor={`${idPrefix}-api-endpoint-mode`}
          className="text-[11px] cursor-pointer leading-tight"
        >
          API Endpoint Mode
        </Label>
        <Select
          value={c.apiEndpointMode}
          onValueChange={(v) => c.setApiEndpointMode(v as ApiEndpointMode)}
        >
          <SelectTrigger
            id={`${idPrefix}-api-endpoint-mode`}
            size="sm"
            className="h-5 min-w-[4.5rem] max-w-[4.5rem] shrink-0 text-[11px] px-1.5"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SwitchRow
        id={`${idPrefix}-show-auto-clear-toggle`}
        label="Show Auto-Clear Toggle"
        checked={c.showAutoClearToggle}
        onCheckedChange={c.setShowAutoClearToggle}
        title="Render the auto-clear toggle inside the widget's input area"
      />
      <SwitchRow
        id={`${idPrefix}-auto-clear`}
        label="Initial Auto-Clear Value"
        checked={c.autoClearConversation}
        onCheckedChange={c.setAutoClearConversation}
        title="Initial value for the widget's auto-clear behavior"
      />

      <SwitchRow
        id={`${idPrefix}-json-extraction`}
        label="JSON Extraction"
        checked={c.jsonExtractionEnabled}
        onCheckedChange={c.setJsonExtractionEnabled}
        title="Run StreamingJsonTracker during this request"
      />
      <SwitchRow
        id={`${idPrefix}-json-fuzzy`}
        label="Fuzzy On Finalize"
        checked={c.jsonExtractionFuzzy}
        onCheckedChange={c.setJsonExtractionFuzzy}
        disabled={!c.jsonExtractionEnabled}
      />

      <div className="flex items-center justify-between gap-1">
        <Label
          htmlFor={`${idPrefix}-json-max`}
          className={`text-[11px] leading-tight ${
            c.jsonExtractionEnabled
              ? "text-foreground cursor-pointer"
              : "text-muted-foreground cursor-not-allowed"
          }`}
        >
          Max Results
        </Label>
        <input
          id={`${idPrefix}-json-max`}
          type="number"
          min={1}
          value={c.jsonExtractionMaxResults}
          onChange={(e) => c.setJsonExtractionMaxResults(e.target.value)}
          disabled={!c.jsonExtractionEnabled}
          placeholder="∞"
          className="h-5 w-16 shrink-0 rounded-md border border-border bg-background px-1.5 text-[11px] leading-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <JsonTextareaField
        id={`${idPrefix}-overrides`}
        label="LLM Overrides (JSON)"
        value={c.overridesJson}
        onChange={c.setOverridesJson}
        placeholder={`{ "temperature": 0.2 }`}
      />
      <JsonTextareaField
        id={`${idPrefix}-app-scope`}
        label="Application Scope (JSON)"
        value={c.applicationScopeJson}
        onChange={c.setApplicationScopeJson}
        placeholder={`{ "selection": "..." }`}
      />

      {c.jsonError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-1 text-[10.5px] text-destructive leading-tight">
          {c.jsonError}
        </div>
      )}
    </div>
  );
}

function EditorContextField({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div className="space-y-0.5">
      <Label
        htmlFor={id}
        className="text-[10.5px] text-muted-foreground cursor-pointer leading-tight"
      >
        {label}
      </Label>
      <VoiceTextarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="pl-1.5 py-1 text-[11px] leading-tight placeholder:text-muted-foreground"
      />
    </div>
  );
}

function JsonTextareaField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-0.5">
      <Label htmlFor={id} className="text-[11px] cursor-pointer leading-tight">
        {label}
      </Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-border bg-background px-1.5 py-1 font-mono text-[10.5px] leading-tight placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}
