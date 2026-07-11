"use client";

/**
 * features/scopes/components/reference/ContextValueInput.tsx
 *
 * THE canonical value-entry switch for a context-item cell. Given a
 * `value_type` (+ optional custom component), renders exactly one control and
 * reports changes as a plain `unknown` echo of what the caller already stores
 * (a string for text/number/boolean/date/document/json-as-text/reference
 * fences, a structured object for custom Smart-Input components) — the same
 * shape `buildScopeValuePayload` already routes into the right `value_*`
 * column. Callers own persistence (auto-save debounce, or an explicit Save
 * button); this component only owns "what does the input look like".
 *
 * `onChange` fires on every interaction (keystroke, toggle, add/remove).
 * `onCommit` fires when the edit is "final" — blur for text/date, immediately
 * for boolean/custom-component/reference (there is no partial state for
 * those). Callers that auto-save wire `onCommit` to their commit function;
 * callers with an explicit Save button can pass the same setter to both.
 */

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";
import { ReferenceValuePicker } from "@/features/scopes/components/reference/ReferenceValuePicker";
import type { ReferenceItemConfig } from "@/features/scopes/utils/referenceCell";

export interface ContextValueInputProps {
  id?: string;
  valueType: ContextValueType;
  customComponent?: VariableCustomComponent | null;
  /** Current value: a string for primitive types, a structured object for a custom component. */
  value: unknown;
  onChange: (value: unknown) => void;
  onCommit?: (value: unknown) => void;
  /** Required when `valueType === "reference"`. */
  referenceConfig?: ReferenceItemConfig | null;
  /** Required when `valueType === "reference"` (resolves the org for the `scope` picker). */
  scopeId?: string;
  displayName?: string;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  /**
   * Dense-form mode: a plain `Textarea` (no mic, no AI-actions menu, no text
   * stats) styled to match a same-row `Input`/`Select` — for quick,
   * secondary value entry inside compact forms (e.g. the inline "add a
   * context item" row). Omit (default) for a real editing surface where
   * `ProTextarea`'s voice/cleanup richness earns its keep.
   */
  compact?: boolean;
}

/**
 * THE ONE type-appropriate placeholder for a primitive value type. `fallback`
 * lets a caller customize only the "nothing more specific applies" case
 * (e.g. `ScopeFieldInput`'s "…leave to save" autosave hint) without forking
 * the whole switch — every other caller either omits it or passes its own
 * `placeholder` prop straight to `ContextValueInput`, bypassing this.
 */
export function placeholderForType(
  t: ContextValueType,
  fallback = "Type a value",
): string {
  switch (t) {
    case "number":
      return "Enter a number";
    case "boolean":
      return "true / false";
    case "document":
      return "https://...";
    case "object":
    case "array":
      return "{ }";
    default:
      return fallback;
  }
}

export function ContextValueInput({
  id,
  valueType,
  customComponent,
  value,
  onChange,
  onCommit,
  referenceConfig,
  scopeId,
  displayName,
  disabled,
  placeholder,
  minHeight,
  maxHeight = 600,
  className,
  compact = false,
}: ContextValueInputProps) {
  const resolvedMinHeight = minHeight ?? (compact ? 40 : 80);
  if (customComponent) {
    // No built-in commit boundary here (no blur, no discrete "done" click for
    // every custom-component kind) — the caller owns whether/when to debounce
    // and commit, exactly like the pre-existing custom-component flow did.
    return (
      <VariableInputComponent
        value={value}
        onChange={onChange}
        variableName={displayName ?? "Value"}
        customComponent={customComponent}
        hideLabel
        compact
      />
    );
  }

  if (valueType === "reference") {
    if (!referenceConfig || !scopeId) {
      return (
        <p className="text-xs text-muted-foreground">
          Reference picker unavailable — missing item configuration.
        </p>
      );
    }
    const fence = typeof value === "string" && value.trim() ? value : null;
    return (
      <ReferenceValuePicker
        config={referenceConfig}
        value={fence}
        scopeId={scopeId}
        disabled={disabled}
        className={className}
        onChange={(next) => {
          onChange(next);
          onCommit?.(next);
        }}
      />
    );
  }

  if (valueType === "boolean") {
    const current = typeof value === "string" && value ? value : "__unset__";
    return (
      <Select
        value={current}
        onValueChange={(v) => {
          const next = v === "__unset__" ? "" : v;
          onChange(next);
          onCommit?.(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unset__">— (empty)</SelectItem>
          <SelectItem value="true">Yes / True</SelectItem>
          <SelectItem value="false">No / False</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (valueType === "date") {
    const current = typeof value === "string" ? value : "";
    return (
      <Input
        id={id}
        type="date"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
        disabled={disabled}
        style={{ fontSize: "16px" }}
        className={className}
      />
    );
  }

  const isJsonType = valueType === "object" || valueType === "array";
  const current = typeof value === "string" ? value : "";

  if (compact) {
    // Plain Textarea, styled to sit flush next to a same-row Input/Select —
    // no mic, no AI-actions menu, no stats bar. See `compact` prop doc above.
    return (
      <Textarea
        id={id}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
        placeholder={placeholder ?? placeholderForType(valueType)}
        minHeight={resolvedMinHeight}
        maxHeight={maxHeight}
        autoGrow
        disabled={disabled}
        style={{ fontSize: "16px" }}
        className={cn(isJsonType && "font-mono", className)}
      />
    );
  }

  return (
    <ProTextarea
      id={id}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit?.(e.target.value)}
      placeholder={placeholder ?? placeholderForType(valueType)}
      minHeight={resolvedMinHeight}
      maxHeight={maxHeight}
      className={
        isJsonType ? `font-mono text-sm ${className ?? ""}` : className
      }
      autoGrow
      disabled={disabled}
      enableTextStats={false}
    />
  );
}

export default ContextValueInput;
