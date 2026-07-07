"use client";

// features/education/tutor/components/TutorSettingsPanel.tsx
//
// The per-learner AI Tutor settings surface (VISION §4 "tunable personality
// and teaching style"). Two knobs — teaching mode (Socratic vs Direct) and
// personality/style — persisted via the tutor settings module and applied to
// every new tutor conversation as launch variables. Rendered inline (used in a
// Popover from the tutor home + conversation header).

import { useEffect, useState } from "react";
import { GraduationCap, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTutorSettings,
  setTutorSettings,
  TUTOR_TEACHING_MODES,
  TUTOR_PERSONALITY_STYLES,
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
  const [settings, setSettings] = useState<TutorSettings>(getTutorSettings);

  // Reflect changes made in another tab / another panel instance.
  useEffect(() => {
    const sync = () => setSettings(getTutorSettings());
    window.addEventListener("education-tutor-settings-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("education-tutor-settings-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = (patch: Partial<TutorSettings>) => {
    const next = setTutorSettings(patch);
    setSettings(next);
    onChange?.(next);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Segmented
        label="Teaching style"
        icon={MessageCircleQuestion}
        options={TUTOR_TEACHING_MODES}
        value={settings.teachingMode}
        onChange={(v) => update({ teachingMode: v })}
        help={MODE_HELP[settings.teachingMode]}
      />
      <Segmented
        label="Personality"
        icon={GraduationCap}
        options={TUTOR_PERSONALITY_STYLES}
        value={settings.personalityStyle}
        onChange={(v) => update({ personalityStyle: v })}
      />
      <p className="text-[11px] text-muted-foreground">
        Applies to your next tutor conversation.
      </p>
    </div>
  );
}
