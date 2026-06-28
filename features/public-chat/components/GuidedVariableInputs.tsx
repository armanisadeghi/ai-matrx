"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { formatText } from "@/utils/text/text-case-converter";
import type { VariableDefinition as PromptVariable } from "@/features/agents/types/agent-definition.types";

// ============================================================================
// TYPES
// ============================================================================

interface GuidedVariableInputsProps {
  variableDefaults: PromptVariable[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  disabled?: boolean;
  onSubmit?: (content: string, resources?: any[]) => Promise<boolean>;
  submitOnEnter?: boolean;
  textInputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /** When true, renders with flat bottom (no bottom border-radius) for seamless join with chat input */
  seamless?: boolean;
}

// ============================================================================
// CUSTOM TEXT INPUT — shown at bottom of non-textarea components
// Lets the user always type a freeform answer as an alternative
// ============================================================================

function InlineCustomInput({
  value,
  onChange,
  placeholder = "Or type your own answer...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-base md:text-sm bg-textured border-none outline-none text-foreground placeholder:text-muted-foreground py-1 px-2 rounded"
      />
    </div>
  );
}

// ============================================================================
// GUIDED SUB-COMPONENTS
// Purpose-built for the one-at-a-time guided flow.
// Maximize width, feel lightweight, auto-advance where sensible.
// All non-textarea components include an InlineCustomInput.
// ============================================================================

/** Button-style single select — tapping an option selects it and auto-advances */
function GuidedSelect({
  value,
  onChange,
  options,
  allowOther,
  onAutoAdvance,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowOther?: boolean;
  onAutoAdvance: () => void;
}) {
  const isOther = value.startsWith("Other: ");
  const [otherText, setOtherText] = useState(isOther ? value.slice(7) : "");
  const [showOther, setShowOther] = useState(isOther);
  // Track whether value was set via custom input (don't auto-advance)
  const isCustom = !options.includes(value) && !isOther && value !== "";

  const handleSelect = (option: string) => {
    onChange(option);
    setShowOther(false);
    setTimeout(onAutoAdvance, 200);
  };

  const handleOtherClick = () => {
    setShowOther(true);
    onChange(`Other: ${otherText}`);
  };

  // Custom input directly sets the value (overriding any selection)
  const handleCustomChange = (v: string) => {
    if (v === "") {
      onChange("");
    } else {
      onChange(v);
    }
    setShowOther(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="grid gap-1.5">
        {options.map((option) => {
          const isActive = value === option;
          return (
            <div
              key={option}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(option)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(option);
                }
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border cursor-pointer ${
                isActive
                  ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/30"
                  : "bg-textured border-border hover:bg-accent hover:border-foreground/20 text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                {isActive && (
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                )}
                <span className={isActive ? "font-medium" : ""}>
                  {option || "(empty)"}
                </span>
              </span>
            </div>
          );
        })}
        {allowOther && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOtherClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOtherClick();
              }
            }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border cursor-pointer ${
              showOther
                ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/30"
                : "bg-textured border-border hover:bg-accent hover:border-foreground/20 text-foreground"
            }`}
          >
            Other...
          </div>
        )}
      </div>
      {showOther && (
        <Textarea
          value={otherText}
          onChange={(e) => {
            setOtherText(e.target.value);
            onChange(`Other: ${e.target.value}`);
          }}
          placeholder="Type your answer..."
          className="min-h-[60px] text-base md:text-sm mt-1"
          autoFocus
        />
      )}
      {!showOther && (
        <InlineCustomInput
          value={isCustom ? value : ""}
          onChange={handleCustomChange}
        />
      )}
    </div>
  );
}

/** Multi-select with tappable items — uses <div role="button"> to avoid nested button with Checkbox */
function GuidedCheckbox({
  value,
  onChange,
  options,
  allowOther,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowOther?: boolean;
}) {
  const selected = value ? value.split("\n").filter(Boolean) : [];
  const otherItem = selected.find((s) => s.startsWith("Other: "));
  const [otherText, setOtherText] = useState(
    otherItem ? otherItem.slice(7) : "",
  );
  const [showOther, setShowOther] = useState(!!otherItem);

  const toggle = (option: string) => {
    const regular = selected.filter((s) => !s.startsWith("Other: "));
    const has = regular.includes(option);
    const next = has
      ? regular.filter((s) => s !== option)
      : [...regular, option];
    const all =
      showOther && otherText ? [...next, `Other: ${otherText}`] : next;
    onChange(all.join("\n"));
  };

  const handleOtherToggle = () => {
    const regular = selected.filter((s) => !s.startsWith("Other: "));
    if (showOther) {
      setShowOther(false);
      onChange(regular.join("\n"));
    } else {
      setShowOther(true);
      onChange([...regular, `Other: ${otherText}`].join("\n"));
    }
  };

  // Custom text input directly sets the full value (overrides selection)
  const handleCustomChange = (v: string) => {
    if (v === "") return;
    onChange(v);
  };

  return (
    <div className="space-y-1.5">
      <div className="grid gap-1.5">
        {options.map((option) => {
          const isActive = selected.includes(option);
          return (
            <div
              key={option}
              role="button"
              tabIndex={0}
              onClick={() => toggle(option)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(option);
                }
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border cursor-pointer ${
                isActive
                  ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/30"
                  : "bg-textured border-border hover:bg-accent hover:border-foreground/20 text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded-sm border flex-shrink-0 ${
                    isActive
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-primary"
                  }`}
                >
                  {isActive && <Check className="w-3 h-3" />}
                </span>
                <span className={isActive ? "font-medium" : ""}>
                  {option || "(empty)"}
                </span>
              </span>
            </div>
          );
        })}
        {allowOther && (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOtherToggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOtherToggle();
              }
            }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border cursor-pointer ${
              showOther
                ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/30"
                : "bg-textured border-border hover:bg-accent hover:border-foreground/20 text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`flex items-center justify-center w-4 h-4 rounded-sm border flex-shrink-0 ${
                  showOther
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-primary"
                }`}
              >
                {showOther && <Check className="w-3 h-3" />}
              </span>
              <span>Other...</span>
            </span>
          </div>
        )}
      </div>
      {showOther && (
        <Textarea
          value={otherText}
          onChange={(e) => {
            setOtherText(e.target.value);
            const regular = selected.filter((s) => !s.startsWith("Other: "));
            onChange([...regular, `Other: ${e.target.value}`].join("\n"));
          }}
          placeholder="Type your answer..."
          className="min-h-[60px] text-base md:text-sm mt-1"
          autoFocus
        />
      )}
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} selected
        </p>
      )}
      {!showOther && (
        <InlineCustomInput value="" onChange={handleCustomChange} />
      )}
    </div>
  );
}

/** Toggle with two big tappable buttons */
function GuidedToggle({
  value,
  onChange,
  toggleValues,
  onAutoAdvance,
}: {
  value: string;
  onChange: (v: string) => void;
  toggleValues?: [string, string];
  onAutoAdvance: () => void;
}) {
  const [offLabel, onLabel] = toggleValues || ["No", "Yes"];

  const handleSelect = (val: string) => {
    onChange(val);
    setTimeout(onAutoAdvance, 200);
  };

  const handleCustomChange = (v: string) => {
    onChange(v || offLabel);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {[offLabel, onLabel].map((label) => {
          const isActive = value === label;
          return (
            <div
              key={label}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(label)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(label);
                }
              }}
              className={`px-4 py-3 rounded-lg text-sm font-medium text-center transition-all border cursor-pointer ${
                isActive
                  ? "bg-primary/10 border-primary text-foreground ring-1 ring-primary/30"
                  : "bg-textured border-border hover:bg-accent hover:border-foreground/20 text-foreground"
              }`}
            >
              {label}
            </div>
          );
        })}
      </div>
      <InlineCustomInput
        value={value !== offLabel && value !== onLabel ? value : ""}
        onChange={handleCustomChange}
      />
    </div>
  );
}

/** Number with big +/- and a centered display */
function GuidedNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const num = parseFloat(value) || 0;
  const canDec = min === undefined || num > min;
  const canInc = max === undefined || num < max;

  return (
    <div>
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => canDec && onChange((num - step).toString())}
          disabled={!canDec}
          className="h-12 w-12 p-0 rounded-full"
        >
          <Minus className="w-5 h-5" />
        </Button>
        <div className="flex items-center justify-center min-w-[120px]">
          <Input
            type="text"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || v === "-" || !isNaN(parseFloat(v))) onChange(v);
            }}
            className="w-full text-center text-2xl font-semibold h-12"
            placeholder="0"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => canInc && onChange((num + step).toString())}
          disabled={!canInc}
          className="h-12 w-12 p-0 rounded-full"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>
      <InlineCustomInput
        value=""
        onChange={(v) => onChange(v)}
        placeholder="Or type a number..."
      />
    </div>
  );
}

/** Textarea — simple, full width. No InlineCustomInput needed (already is text). */
function GuidedTextarea({
  value,
  onChange,
  variableName,
}: {
  value: string;
  onChange: (v: string) => void;
  variableName: string;
}) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Type your ${variableName.toLowerCase()}...`}
      className="min-h-[100px] text-base md:text-sm resize-none bg-textured"
      autoFocus
    />
  );
}

// ============================================================================
// GUIDED VARIABLE INPUT RENDERER
// ============================================================================

function GuidedVariableContent({
  variable,
  value,
  onChange,
  onAutoAdvance,
}: {
  variable: PromptVariable;
  value: string;
  onChange: (v: string) => void;
  onAutoAdvance: () => void;
}) {
  const cc = variable.customComponent;

  if (!cc || cc.type === "textarea") {
    return (
      <GuidedTextarea
        value={value}
        onChange={onChange}
        variableName={variable.name}
      />
    );
  }

  switch (cc.type) {
    case "select":
    case "radio":
      if (!cc.options?.length) {
        return (
          <GuidedTextarea
            value={value}
            onChange={onChange}
            variableName={variable.name}
          />
        );
      }
      return (
        <GuidedSelect
          value={value}
          onChange={onChange}
          options={cc.options}
          allowOther={cc.allowOther}
          onAutoAdvance={onAutoAdvance}
        />
      );
    case "checkbox":
      if (!cc.options?.length) {
        return (
          <GuidedTextarea
            value={value}
            onChange={onChange}
            variableName={variable.name}
          />
        );
      }
      return (
        <GuidedCheckbox
          value={value}
          onChange={onChange}
          options={cc.options}
          allowOther={cc.allowOther}
        />
      );
    case "toggle":
      return (
        <GuidedToggle
          value={value}
          onChange={onChange}
          toggleValues={cc.toggleValues}
          onAutoAdvance={onAutoAdvance}
        />
      );
    case "number":
      return (
        <GuidedNumber
          value={value}
          onChange={onChange}
          min={cc.min}
          max={cc.max}
          step={cc.step}
        />
      );
    default:
      return (
        <GuidedTextarea
          value={value}
          onChange={onChange}
          variableName={variable.name}
        />
      );
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GuidedVariableInputs({
  variableDefaults,
  values,
  onChange,
  disabled = false,
  onSubmit,
  submitOnEnter = false,
  textInputRef,
  seamless = false,
}: GuidedVariableInputsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const total = variableDefaults.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setIsScrollable(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeIndex, isCollapsed]);

  if (total === 0) return null;

  const variable = variableDefaults[activeIndex];
  const value = values[variable.name] ?? variable.defaultValue ?? "";
  const formattedName = formatText(variable.name);
  const helpText = variable.helpText;

  const answeredCount = variableDefaults.filter((v) => {
    const val = values[v.name] ?? v.defaultValue ?? "";
    return val.trim() !== "";
  }).length;

  const goNext = useCallback(() => {
    if (activeIndex < total - 1) {
      setActiveIndex((i) => i + 1);
    }
  }, [activeIndex, total]);

  const goPrev = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
  }, [activeIndex]);

  const handleSkipAll = useCallback(() => {
    setIsCollapsed(true);
    textInputRef?.current?.focus();
  }, [textInputRef]);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((c) => !c);
  }, []);

  const handleChange = useCallback(
    (v: string) => {
      onChange(variable.name, v);
    },
    [onChange, variable.name],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        const cc = variable.customComponent;
        if (!cc || cc.type === "textarea") {
          e.preventDefault();
          if (activeIndex < total - 1) {
            goNext();
          } else if (submitOnEnter && onSubmit) {
            onSubmit("", undefined);
          } else {
            textInputRef?.current?.focus();
          }
        }
      }
    },
    [
      variable,
      activeIndex,
      total,
      goNext,
      submitOnEnter,
      onSubmit,
      textInputRef,
    ],
  );

  // Border radius: seamless mode removes bottom rounding to merge with chat input
  const outerRadius = seamless ? "rounded-t-xl rounded-b-none" : "rounded-xl";
  const collapsedRadius = seamless
    ? "rounded-t-xl rounded-b-none"
    : "rounded-xl";

  // Progress dots — <span> with role="button" to avoid nested <button> in collapsed bar
  const progressDots = (
    <div className="flex items-center gap-1">
      {variableDefaults.map((v, i) => {
        const filled = (values[v.name] ?? v.defaultValue ?? "").trim() !== "";
        const isCurrent = i === activeIndex;
        return (
          <span
            key={v.name}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex(i);
              if (isCollapsed) setIsCollapsed(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveIndex(i);
                if (isCollapsed) setIsCollapsed(false);
              }
            }}
            className={`rounded-full transition-all cursor-pointer ${
              isCurrent
                ? "w-5 h-2 bg-primary"
                : filled
                  ? "w-2 h-2 bg-primary/40"
                  : "w-2 h-2 bg-muted-foreground/20"
            }`}
            title={formatText(v.name)}
          />
        );
      })}
    </div>
  );

  // --- Collapsed state ---
  if (isCollapsed) {
    return (
      <div
        className={`bg-card border border-border ${collapsedRadius} ${seamless ? "border-b-0" : ""}`}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggleCollapse}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggleCollapse();
            }
          }}
          className={`w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors cursor-pointer ${collapsedRadius}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {progressDots}
            <span className="text-xs text-muted-foreground truncate">
              {answeredCount}/{total} answered
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        </div>
      </div>
    );
  }

  // --- Expanded state ---
  return (
    <div
      className={`bg-muted border border-border ${outerRadius} ${seamless ? "border-b-0" : ""}`}
      onKeyDown={handleKeyDown}
    >
      {/* Header — always visible, never scrolls */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border/40">
        {/* Row 1: progress dots + title + skip */}
        <div className="flex items-center gap-2">
          {progressDots}
          <h3 className="flex-1 text-sm font-medium text-foreground truncate min-w-0">
            {formattedName}
          </h3>
          <button
            type="button"
            onClick={handleSkipAll}
            className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground hover:bg-accent px-2 py-0.5 rounded transition-colors whitespace-nowrap"
          >
            Skip questions
          </button>
        </div>
        {/* Row 2: description (only when present) */}
        {helpText && (
          <p className="ml-2 mt-1.5 text-xs text-muted-foreground leading-snug">
            {helpText}
          </p>
        )}
      </div>

      {/* Question content — only this area scrolls, with conditional bottom fade */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="max-h-[28dvh] md:max-h-[35dvh] overflow-y-auto overscroll-contain px-3 py-2"
        >
          <GuidedVariableContent
            variable={variable}
            value={value}
            onChange={handleChange}
            onAutoAdvance={goNext}
          />
        </div>
        {isScrollable && (
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 z-10 bg-gradient-to-t from-muted to-transparent" />
        )}
      </div>

      {/* Navigation — always visible, never scrolls */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIndex === 0}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default transition-colors px-1 py-0.5"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>

        <span className="text-xs text-muted-foreground">
          {activeIndex + 1} of {total}
        </span>

        {activeIndex < total - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-1 text-xs text-primary hover:text-foreground transition-colors px-1 py-0.5 font-medium"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSkipAll}
            className="flex items-center gap-1 text-xs text-primary hover:text-foreground transition-colors px-1 py-0.5 font-medium"
          >
            <Check className="w-3.5 h-3.5" />
            Done
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default GuidedVariableInputs;
