"use client";

import React, { useState } from "react";
import {
  Languages,
  Brain,
  BookOpen,
  MessageSquare,
  Palette,
  Gauge,
  Loader2,
  Check,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useAgentBuilder } from "../services/agentBuilderService";
import {
  complexityLevels,
  creativityLevels,
  concisenessLevels,
  languageOptions,
  personaOptions,
  toneStyleOptions,
  cognitiveBiasOptions,
  formatStyleOptions,
} from "../instant-assistant/constants";

interface OptionItem {
  id: string;
  label: string;
  prompt: string;
  shortDesc?: string;
}

interface InstantAssistantBuilderProps {
  onComplete?: () => void;
}

function generateAgentName(options: {
  persona: OptionItem | null;
  toneStyle: OptionItem | null;
}): string {
  const parts = ["Chat Assistant"];
  if (options.persona) parts.push(options.persona.label);
  if (options.toneStyle) parts.push(options.toneStyle.label);
  return parts.join(" - ");
}

const VALID_LEVELS = [1, 3, 5, 7, 10] as const;

function snapToNearestLevel(value: number): number {
  return VALID_LEVELS.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  );
}

export function InstantAssistantBuilder({
  onComplete,
}: InstantAssistantBuilderProps) {
  const { createAgent } = useAgentBuilder(onComplete);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedOptions, setSelectedOptions] = useState<{
    language: OptionItem;
    persona: OptionItem | null;
    toneStyle: OptionItem | null;
    cognitiveBias: OptionItem | null;
    formatStyle: OptionItem | null;
    complexity: number;
    creativity: number;
    conciseness: number;
  }>({
    language: {
      id: "english",
      label: "English",
      prompt: "Respond in English.",
    },
    persona: null,
    toneStyle: null,
    cognitiveBias: null,
    formatStyle: null,
    complexity: 5,
    creativity: 5,
    conciseness: 5,
  });

  const generateSystemMessage = () => {
    let prompt =
      "You are an AI assistant with the following characteristics:\n\n";

    if (selectedOptions.language) {
      prompt += `${selectedOptions.language.prompt}\n\n`;
    }
    if (selectedOptions.persona) {
      prompt += `${selectedOptions.persona.prompt}\n\n`;
    }
    if (selectedOptions.toneStyle) {
      prompt += `${selectedOptions.toneStyle.prompt}\n\n`;
    }
    if (selectedOptions.cognitiveBias) {
      prompt += `${selectedOptions.cognitiveBias.prompt}\n\n`;
    }
    if (selectedOptions.formatStyle) {
      prompt += `${selectedOptions.formatStyle.prompt}\n\n`;
    }

    const cl = snapToNearestLevel(selectedOptions.complexity);
    if (cl !== 5) {
      prompt += `Complexity Level: ${complexityLevels[cl as keyof typeof complexityLevels].prompt}\n\n`;
    }
    const cr = snapToNearestLevel(selectedOptions.creativity);
    if (cr !== 5) {
      prompt += `Creativity Level: ${creativityLevels[cr as keyof typeof creativityLevels].prompt}\n\n`;
    }
    const cn = snapToNearestLevel(selectedOptions.conciseness);
    if (cn !== 5) {
      prompt += `Response Length: ${concisenessLevels[cn as keyof typeof concisenessLevels].prompt}\n\n`;
    }

    return prompt;
  };

  const handleOptionSelect = (category: string, option: OptionItem) => {
    setSelectedOptions((prev) => ({ ...prev, [category]: option }));
  };

  const clearOption = (category: string) => {
    setSelectedOptions((prev) => ({ ...prev, [category]: null }));
  };

  const handleSliderChange = (name: string, value: number) => {
    setSelectedOptions((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const systemMessage = generateSystemMessage();
      const autoName = generateAgentName(selectedOptions);
      await createAgent({ name: autoName, systemMessage });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-auto p-3 sm:p-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Left Column */}
            <div className="space-y-3">
              <SelectSection
                icon={
                  <Languages
                    className="text-blue-500 dark:text-blue-400"
                    size={16}
                  />
                }
                label="Language"
                value={selectedOptions.language?.id}
                options={languageOptions}
                onSelect={(opt) => handleOptionSelect("language", opt)}
              />
              <SelectSection
                icon={
                  <MessageSquare
                    className="text-yellow-500 dark:text-yellow-400"
                    size={16}
                  />
                }
                label="Persona"
                value={selectedOptions.persona?.id || "none"}
                options={personaOptions}
                nullable
                onSelect={(opt) => handleOptionSelect("persona", opt)}
                onClear={() => clearOption("persona")}
              />
              <SelectSection
                icon={
                  <Brain
                    className="text-green-500 dark:text-green-400"
                    size={16}
                  />
                }
                label="Cognitive Approach"
                value={selectedOptions.cognitiveBias?.id || "none"}
                options={cognitiveBiasOptions}
                nullable
                showShortDesc
                onSelect={(opt) => handleOptionSelect("cognitiveBias", opt)}
                onClear={() => clearOption("cognitiveBias")}
              />
              <SelectSection
                icon={
                  <BookOpen
                    className="text-red-500 dark:text-red-400"
                    size={16}
                  />
                }
                label="Format Style"
                value={selectedOptions.formatStyle?.id || "none"}
                options={formatStyleOptions}
                nullable
                onSelect={(opt) => handleOptionSelect("formatStyle", opt)}
                onClear={() => clearOption("formatStyle")}
              />
              <SelectSection
                icon={
                  <Palette
                    className="text-pink-500 dark:text-pink-400"
                    size={16}
                  />
                }
                label="Tone & Style"
                value={selectedOptions.toneStyle?.id || "none"}
                options={toneStyleOptions}
                nullable
                onSelect={(opt) => handleOptionSelect("toneStyle", opt)}
                onClear={() => clearOption("toneStyle")}
              />
            </div>

            {/* Right Column — Fine-Tuning */}
            <div className="space-y-3">
              <div className="border-border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge
                    className="text-indigo-500 dark:text-indigo-400"
                    size={16}
                  />
                  <h3 className="text-sm font-medium">Fine-Tuning</h3>
                </div>
                <div className="space-y-4">
                  <LevelSlider
                    label="Complexity"
                    value={selectedOptions.complexity}
                    levels={complexityLevels}
                    leftLabel="Elementary"
                    rightLabel="Expert"
                    onChange={(v) => handleSliderChange("complexity", v)}
                  />
                  <LevelSlider
                    label="Creativity"
                    value={selectedOptions.creativity}
                    levels={creativityLevels}
                    leftLabel="Literal"
                    rightLabel="Experimental"
                    onChange={(v) => handleSliderChange("creativity", v)}
                  />
                  <LevelSlider
                    label="Conciseness"
                    value={selectedOptions.conciseness}
                    levels={concisenessLevels}
                    leftLabel="Minimal"
                    rightLabel="Comprehensive"
                    onChange={(v) => handleSliderChange("conciseness", v)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 p-3 border-t bg-muted/30">
        <Button
          onClick={handleCreate}
          disabled={isSaving}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Create Agent
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function SelectSection({
  icon,
  label,
  value,
  options,
  nullable,
  showShortDesc,
  onSelect,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  options: OptionItem[];
  nullable?: boolean;
  showShortDesc?: boolean;
  onSelect: (opt: OptionItem) => void;
  onClear?: () => void;
}) {
  return (
    <div className="border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-medium">{label}</h3>
      </div>
      <Select
        value={value}
        onValueChange={(val) => {
          if (val === "none") {
            onClear?.();
          } else {
            const opt = options.find((o) => o.id === val);
            if (opt) onSelect(opt);
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {nullable && <SelectItem value="none">None (Default)</SelectItem>}
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {showShortDesc ? (
                <div className="flex flex-col py-1">
                  <span className="font-medium">{opt.label}</span>
                  {"shortDesc" in opt && (
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {(opt as OptionItem & { shortDesc: string }).shortDesc}
                    </span>
                  )}
                </div>
              ) : (
                opt.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LevelSlider({
  label,
  value,
  levels,
  leftLabel,
  rightLabel,
  onChange,
}: {
  label: string;
  value: number;
  levels: Record<number, { label: string; prompt: string }>;
  leftLabel: string;
  rightLabel: string;
  onChange: (val: number) => void;
}) {
  const snapped = snapToNearestLevel(value);
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs font-medium">{label}</label>
        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {levels[snapped]?.label}
        </span>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(snapToNearestLevel(v))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
        <span>{leftLabel}</span>
        <span>Standard</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
