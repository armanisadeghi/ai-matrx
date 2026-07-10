"use client";

// features/education/tutor/components/TutorSettingsPanel.tsx
//
// The per-learner AI Tutor settings surface (VISION §4 "tunable personality
// and teaching style"). Two knobs — teaching mode (Socratic vs Direct) and
// personality/style — persisted on the DURABLE settings system
// (`userPreferences.tutor.*`, synced across devices) and applied to every new
// tutor conversation as launch variables. Rendered inline (used in a Popover
// from the tutor home + conversation header).

import { useEffect } from "react";
import { GraduationCap, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSetting } from "@/features/settings/hooks/useSetting";
import {
  TUTOR_TEACHING_MODES,
  TUTOR_PERSONALITY_STYLES,
  migrateLegacyTutorSettings,
  type TutorTeachingMode,
  type TutorPersonalityStyle,
  type TutorSettings,
} from "../settings";

const MODE_HELP: Record<string, string> = {
  Socratic: "Guides you with questions and hints so you reach the answer yourself.",
  Direct: "Explains clearly and completely, then checks your understanding.",
};

function Segmented<T extends string>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  help,
}: {
  label: string;
  icon: typeof GraduationCap;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

export interface TutorSettingsPanelProps {
  className?: string;
  onChange?: (next: TutorSettings) => void;
}

export function TutorSettingsPanel({ className, onChange }: TutorSettingsPanelProps) {
  // One-time seed from the legacy localStorage key (no-op after first run / on
  // a fresh device). Runs before the reads settle so a returning learner's saved
  // preference is already reflected.
  useEffect(() => {
    migrateLegacyTutorSettings();
  }, []);

  const [teachingMode, setTeachingMode] = useSetting<TutorTeachingMode>(
    "userPreferences.tutor.teachingMode",
  );
  const [personalityStyle, setPersonalityStyle] = useSetting<TutorPersonalityStyle>(
    "userPreferences.tutor.personalityStyle",
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Segmented
        label="Teaching style"
        icon={MessageCircleQuestion}
        options={TUTOR_TEACHING_MODES}
        value={teachingMode}
        onChange={(v) => {
          setTeachingMode(v);
          onChange?.({ teachingMode: v, personalityStyle });
        }}
        help={MODE_HELP[teachingMode]}
      />
      <Segmented
        label="Personality"
        icon={GraduationCap}
        options={TUTOR_PERSONALITY_STYLES}
        value={personalityStyle}
        onChange={(v) => {
          setPersonalityStyle(v);
          onChange?.({ teachingMode, personalityStyle: v });
        }}
      />
      <p className="text-[11px] text-muted-foreground">
        Applies to your next tutor conversation. Synced across your devices.
      </p>
    </div>
  );
}
