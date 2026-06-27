"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RotateCcw, Plus, X } from "lucide-react";
import {
  setStructuredInstruction,
  resetStructuredInstruction,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectStructuredInstruction } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import type { SystemInstruction } from "@/features/agents/types/agent-api-types";

interface SystemInstructionEditorProps {
  conversationId: string;
}

export function SystemInstructionEditor({
  conversationId,
}: SystemInstructionEditorProps) {
  const dispatch = useAppDispatch();
  const instruction = useAppSelector(selectStructuredInstruction(conversationId));
  const data = (instruction ?? {}) as Partial<SystemInstruction>;

  const update = (changes: Partial<SystemInstruction>) => {
    dispatch(setStructuredInstruction({ conversationId, changes }));
  };

  const handleReset = () => {
    dispatch(resetStructuredInstruction(conversationId));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Structured System Instruction
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-muted-foreground h-6 text-xs"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </Button>
      </div>

      <Section title="Prompt Structure">
        <FieldTextarea
          label="Intro"
          description="Placed before everything else in the final prompt"
          value={data.intro}
          onChange={(v) => update({ intro: v || undefined })}
        />
        <FieldTextarea
          label="Outro"
          description="Placed after everything else in the final prompt"
          value={data.outro}
          onChange={(v) => update({ outro: v || undefined })}
        />
      </Section>

      <Separator />

      <Section title="Injected Sections">
        <StringListField
          label="Prepend sections"
          description="Injected before the base instruction"
          value={data.prepend_sections}
          onChange={(v) =>
            update({ prepend_sections: v.length ? v : undefined })
          }
        />
        <StringListField
          label="Append sections"
          description="Injected after the base instruction, before content blocks"
          value={data.append_sections}
          onChange={(v) =>
            update({ append_sections: v.length ? v : undefined })
          }
        />
      </Section>

      <Separator />

      <Section title="Content Blocks">
        <StringListField
          label="Block IDs"
          description="UUIDs or slug names of content blocks fetched from the DB"
          value={data.content_blocks}
          onChange={(v) => update({ content_blocks: v.length ? v : undefined })}
          placeholder="e.g. sample-thinking or a UUID"
        />
      </Section>

      <Separator />

      <Section title="Tools List">
        <StringListField
          label="Tool names"
          description="Listed in the system prompt (auto-formatted by the server)"
          value={data.tools_list}
          onChange={(v) => update({ tools_list: v.length ? v : undefined })}
          placeholder="tool_name"
        />
      </Section>

      <Separator />

      <Section title="Auto-Injected Sections">
        <div className="space-y-3">
          <ToggleRow
            id={`include-date-${conversationId}`}
            label="Include current date"
            checked={data.include_date ?? true}
            onChange={(v) => update({ include_date: v })}
          />
          <ToggleRow
            id={`include-code-${conversationId}`}
            label="Include code guidelines"
            checked={data.include_code_guidelines ?? false}
            onChange={(v) => update({ include_code_guidelines: v })}
          />
          <ToggleRow
            id={`include-safety-${conversationId}`}
            label="Include safety guidelines"
            checked={data.include_safety_guidelines ?? false}
            onChange={(v) => update({ include_safety_guidelines: v })}
          />
          <ToggleRow
            id={`include-context-${conversationId}`}
            label="Include context awareness block"
            checked={data.include_context_block ?? true}
            onChange={(v) => update({ include_context_block: v })}
          />
          <ToggleRow
            id={`include-actions-${conversationId}`}
            label="Include Matrx Actions guidance"
            checked={data.include_actions_guidance ?? false}
            onChange={(v) => update({ include_actions_guidance: v })}
          />
        </div>
      </Section>

      <Separator />

      <Section title="Metadata (tracking only)">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput
            label="Version"
            value={data.version}
            onChange={(v) => update({ version: v || undefined })}
            placeholder="e.g. v1.2"
          />
          <FieldInput
            label="Category"
            value={data.category}
            onChange={(v) => update({ category: v || undefined })}
            placeholder="e.g. support"
          />
        </div>
      </Section>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {children}
    </div>
  );
}

function FieldTextarea({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[60px] text-sm"
        style={{ fontSize: "16px" }}
        rows={2}
      />
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
        style={{ fontSize: "16px" }}
        placeholder={placeholder}
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="text-sm cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StringListField({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const items = value ?? [];

  const addItem = () => onChange([...items, ""]);

  const removeItem = (idx: number) =>
    onChange(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, val: string) =>
    onChange(items.map((item, i) => (i === idx ? val : item)));

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => updateItem(idx, e.target.value)}
              className="text-sm flex-1"
              style={{ fontSize: "16px" }}
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        className="h-7 text-xs"
      >
        <Plus className="w-3 h-3 mr-1" />
        Add
      </Button>
    </div>
  );
}
