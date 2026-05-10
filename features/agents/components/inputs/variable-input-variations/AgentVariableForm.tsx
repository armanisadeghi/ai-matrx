"use client";

import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { setUserVariableValue } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectShowVariablePanel } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { toggleVariablePanel } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import { formatText } from "@/utils/text/text-case-converter";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type {
  VariableDefinition,
  VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import { isMediaVariableType } from "@/features/agents/types/agent-definition.types";
import { ImageVariableInput } from "@/features/agents/components/inputs/input-components/ImageVariableInput";
import { AudioVariableInput } from "@/features/agents/components/inputs/input-components/AudioVariableInput";
import { VideoVariableInput } from "@/features/agents/components/inputs/input-components/VideoVariableInput";
import { DocumentVariableInput } from "@/features/agents/components/inputs/input-components/DocumentVariableInput";
import { YoutubeVariableInput } from "@/features/agents/components/inputs/input-components/YoutubeVariableInput";

const IOS_INPUT_STYLE = { fontSize: "16px" } as const;

interface AgentVariableFormProps {
  conversationId: string;
}

export function AgentVariableForm({ conversationId }: AgentVariableFormProps) {
  const dispatch = useAppDispatch();
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const userValues = useAppSelector(selectUserVariableValues(conversationId));
  const showVariables = useAppSelector(selectShowVariablePanel(conversationId));

  if (!definitions || definitions.length === 0) return null;

  const filledCount = definitions.filter((def) => {
    const val = userValues[def.name];
    if (val === undefined || val === null || val === "") return false;
    if (Array.isArray(val)) return val.length > 0;
    return String(val).length > 0;
  }).length;

  const setValue = (name: string, value: unknown) =>
    dispatch(setUserVariableValue({ conversationId, name, value }));

  return (
    <div className="flex flex-col max-h-72 border-b border-border overflow-hidden">
      {/* Always-visible toggle header */}
      <button
        className="flex items-center justify-between w-full px-2.5 py-1.5 hover:bg-accent/50 transition-colors shrink-0"
        onClick={() => dispatch(toggleVariablePanel(conversationId))}
      >
        <span className="text-xs font-medium text-foreground">
          {showVariables
            ? "Fill in the details below"
            : `${filledCount}/${definitions.length} details provided`}
        </span>
        <motion.div
          animate={{ rotate: showVariables ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      {showVariables && (
        <div className="border-t border-border flex-1 min-h-0 overflow-y-auto">
          <div className="px-2.5 py-2">
            {definitions.map((def, i) => (
              <div key={def.name}>
                {i > 0 && <div className="border-t border-border my-2" />}
                <VariableField
                  def={def}
                  value={userValues[def.name] ?? def.defaultValue ?? ""}
                  onChange={(v) => setValue(def.name, v)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared label + help
// ---------------------------------------------------------------------------

function FieldLabel({
  fieldId,
  name,
  required,
  helpText,
}: {
  fieldId: string;
  name: string;
  required?: boolean;
  helpText?: string;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-baseline gap-1">
        <Label
          htmlFor={fieldId}
          className="text-xs font-medium text-foreground"
        >
          {name}
        </Label>
        {required && (
          <span
            className="text-destructive text-xs select-none"
            aria-label="required"
          >
            *
          </span>
        )}
      </div>
      {helpText && (
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          {helpText}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared option row styling
// ---------------------------------------------------------------------------

const OPTION_ROW =
  "flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent/50 transition-colors cursor-pointer";
const OPTION_INDICATOR = "h-3.5 w-3.5 shrink-0";
const OPTION_LABEL = "text-xs text-foreground";

// ---------------------------------------------------------------------------
// Per-field renderer
// ---------------------------------------------------------------------------

interface VariableFieldProps {
  def: VariableDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function VariableField({ def, value, onChange }: VariableFieldProps) {
  const formattedName = formatText(def.name, { textCase: "title" });
  const cc = def.customComponent;
  const fieldId = `var-${def.name}`;
  const fieldLabel = (
    <FieldLabel
      fieldId={fieldId}
      name={formattedName}
      required={def.required}
      helpText={def.helpText}
    />
  );

  if (!cc || cc.type === "textarea") {
    return (
      <div>
        {fieldLabel}
        <VoiceTextarea
          id={fieldId}
          value={String(value ?? "")}
          placeholder={`Enter ${formattedName.toLowerCase()}...`}
          onChange={(e) => onChange(e.target.value)}
          autoGrow
          minHeight={28}
          maxHeight={120}
          className="text-xs bg-transparent"
          style={IOS_INPUT_STYLE}
        />
      </div>
    );
  }

  if (cc.type === "toggle" || cc.type === "light-switch") {
    const offLabel = cc.toggleValues?.[0] ?? "No";
    const onLabel = cc.toggleValues?.[1] ?? "Yes";
    const checked = value === true || value === "true" || value === onLabel;
    return (
      <div>
        {fieldLabel}
        <div className="flex items-center gap-2 px-1">
          <Switch
            id={fieldId}
            checked={checked}
            onCheckedChange={(c) => onChange(c ? onLabel : offLabel)}
            className="scale-90 origin-left"
          />
          <span className="text-xs text-foreground">
            {checked ? onLabel : offLabel}
          </span>
        </div>
      </div>
    );
  }

  if (
    cc.type === "radio" ||
    cc.type === "pill-toggle" ||
    cc.type === "selection-list" ||
    cc.type === "buttons"
  ) {
    return (
      <div>
        {fieldLabel}
        <RadioField
          cc={cc}
          value={value}
          onChange={onChange}
          fieldId={fieldId}
        />
      </div>
    );
  }

  if (cc.type === "checkbox") {
    return (
      <div>
        {fieldLabel}
        <CheckboxField
          cc={cc}
          value={value}
          onChange={onChange}
          fieldId={fieldId}
        />
      </div>
    );
  }

  if (cc.type === "select") {
    return (
      <div>
        {fieldLabel}
        <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={fieldId} className="h-7 text-xs bg-transparent">
            <SelectValue placeholder="Choose..." />
          </SelectTrigger>
          <SelectContent>
            {(cc.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">
                {formatText(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (cc && isMediaVariableType(cc.type)) {
    const sharedProps = {
      value,
      onChange,
      variableName: def.name,
      compact: false,
    };
    return (
      <div>
        {fieldLabel}
        {cc.type === "image" && <ImageVariableInput {...sharedProps} />}
        {cc.type === "audio" && <AudioVariableInput {...sharedProps} />}
        {cc.type === "video" && <VideoVariableInput {...sharedProps} />}
        {cc.type === "document" && <DocumentVariableInput {...sharedProps} />}
        {cc.type === "youtube" && <YoutubeVariableInput {...sharedProps} />}
      </div>
    );
  }

  if (cc.type === "number" || cc.type === "slider") {
    return (
      <div>
        {fieldLabel}
        <div className="flex items-center gap-2">
          <Input
            id={fieldId}
            type="number"
            value={
              value === undefined || value === null || value === ""
                ? ""
                : String(value)
            }
            placeholder="0"
            min={cc.min}
            max={cc.max}
            step={cc.step ?? 1}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === "" ? "" : parseFloat(raw));
            }}
            className="h-7 text-xs bg-transparent w-28"
            style={IOS_INPUT_STYLE}
          />
          {(cc.min !== undefined || cc.max !== undefined) && (
            <span className="text-[11px] text-muted-foreground shrink-0">
              {cc.min !== undefined && cc.max !== undefined
                ? `${cc.min}–${cc.max}`
                : cc.min !== undefined
                  ? `min ${cc.min}`
                  : `max ${cc.max}`}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {fieldLabel}
      <Input
        id={fieldId}
        value={String(value ?? "")}
        placeholder={`Enter ${formattedName.toLowerCase()}...`}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs bg-transparent"
        style={IOS_INPUT_STYLE}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radio — 2-col grid for >3, scroll for >8, "Other" only shows input on select
// ---------------------------------------------------------------------------

function RadioField({
  cc,
  value,
  onChange,
  fieldId,
}: {
  cc: VariableCustomComponent;
  value: unknown;
  onChange: (v: unknown) => void;
  fieldId: string;
}) {
  const options = cc.options ?? [];
  const strValue = String(value ?? "");
  const isOtherSelected =
    cc.allowOther &&
    (strValue === "__other__" ||
      (strValue.length > 0 && !options.includes(strValue)));
  const [otherText, setOtherText] = useState(isOtherSelected ? strValue : "");
  const useGrid = options.length > 3;
  const needsScroll = options.length > 8;

  const content = (
    <RadioGroup
      value={isOtherSelected ? "__other__" : strValue}
      onValueChange={(v) => {
        if (v === "__other__") {
          onChange(otherText || "__other__");
        } else {
          onChange(v);
        }
      }}
      className={cn(useGrid ? "grid grid-cols-2 gap-x-2 gap-y-0" : "gap-0")}
    >
      {options.map((opt) => (
        <label key={opt} className={OPTION_ROW}>
          <RadioGroupItem
            value={opt}
            id={`${fieldId}-${opt}`}
            className={OPTION_INDICATOR}
          />
          <span className={OPTION_LABEL}>{formatText(opt)}</span>
        </label>
      ))}
      {cc.allowOther && (
        <label className={cn(OPTION_ROW, "col-span-full")}>
          <RadioGroupItem
            value="__other__"
            id={`${fieldId}-other`}
            className={OPTION_INDICATOR}
          />
          <span className={OPTION_LABEL}>Other</span>
        </label>
      )}
    </RadioGroup>
  );

  const otherInput = isOtherSelected && (
    <div className="mt-1 pl-6">
      <VoiceTextarea
        value={otherText === "__other__" ? "" : otherText}
        placeholder="Enter your answer..."
        onChange={(e) => {
          setOtherText(e.target.value);
          onChange(e.target.value || "__other__");
        }}
        autoGrow
        minHeight={28}
        maxHeight={80}
        className="text-xs bg-transparent"
        style={IOS_INPUT_STYLE}
      />
    </div>
  );

  if (needsScroll) {
    return (
      <div className="max-h-36 overflow-y-auto">
        {content}
        {otherInput}
      </div>
    );
  }

  return (
    <>
      {content}
      {otherInput}
    </>
  );
}

// ---------------------------------------------------------------------------
// Checkbox — 2-col grid for >3, scroll for >8, "Other" only shows input on check
// ---------------------------------------------------------------------------

function CheckboxField({
  cc,
  value,
  onChange,
  fieldId,
}: {
  cc: VariableCustomComponent;
  value: unknown;
  onChange: (v: unknown) => void;
  fieldId: string;
}) {
  const options = cc.options ?? [];
  const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
  const otherValues = selected.filter((s) => !options.includes(s));
  const isOtherChecked = otherValues.length > 0;
  const [otherText, setOtherText] = useState(otherValues[0] ?? "");
  const useGrid = options.length > 3;
  const needsScroll = options.length > 8;

  const toggle = (opt: string, checked: boolean) => {
    const next = checked
      ? [...selected, opt]
      : selected.filter((s) => s !== opt);
    onChange(next);
  };

  const content = (
    <div
      className={cn(useGrid ? "grid grid-cols-2 gap-x-2 gap-y-0" : "space-y-0")}
    >
      {options.map((opt) => (
        <label key={opt} className={OPTION_ROW}>
          <Checkbox
            id={`${fieldId}-${opt}`}
            checked={selected.includes(opt)}
            onCheckedChange={(c) => toggle(opt, c === true)}
            className={OPTION_INDICATOR}
          />
          <span className={OPTION_LABEL}>{formatText(opt)}</span>
        </label>
      ))}
      {cc.allowOther && (
        <label className={cn(OPTION_ROW, "col-span-full")}>
          <Checkbox
            id={`${fieldId}-other`}
            checked={isOtherChecked}
            onCheckedChange={(c) => {
              if (c) {
                if (otherText) {
                  onChange([
                    ...selected.filter((s) => options.includes(s)),
                    otherText,
                  ]);
                } else {
                  onChange([
                    ...selected.filter((s) => options.includes(s)),
                    "__other__",
                  ]);
                }
              } else {
                onChange(selected.filter((s) => options.includes(s)));
                setOtherText("");
              }
            }}
            className={OPTION_INDICATOR}
          />
          <span className={OPTION_LABEL}>Other</span>
        </label>
      )}
    </div>
  );

  const otherInput = isOtherChecked && (
    <div className="mt-1 pl-6">
      <VoiceTextarea
        value={otherText === "__other__" ? "" : otherText}
        placeholder="Enter your answer..."
        onChange={(e) => {
          setOtherText(e.target.value);
          const knownSelected = selected.filter((s) => options.includes(s));
          onChange(
            e.target.value ? [...knownSelected, e.target.value] : knownSelected,
          );
        }}
        autoGrow
        minHeight={28}
        maxHeight={80}
        className="text-xs bg-transparent"
        style={IOS_INPUT_STYLE}
      />
    </div>
  );

  if (needsScroll) {
    return (
      <div className="max-h-36 overflow-y-auto">
        {content}
        {otherInput}
      </div>
    );
  }

  return (
    <>
      {content}
      {otherInput}
    </>
  );
}
