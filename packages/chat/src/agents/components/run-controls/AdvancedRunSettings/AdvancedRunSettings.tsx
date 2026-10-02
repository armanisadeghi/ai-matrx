'use client';

/**
 * AdvancedRunSettings
 *
 * Composition-only. Hands the panel value to the algorithm engine and
 * displays a complexity badge top-right. The engine and its rules live
 * under ./algorithm/ — this component never imports rule weights directly.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ARTIFACT_SKILLS,
  ATTRIBUTES,
  DEFAULT_ADVANCED_RUN_SETTINGS,
  IMPORTANCE_ITEMS,
  INPUT_MODES,
  PRIMARY_OUTPUTS,
  TOOLS,
  type AdvancedRunSettingsValue,
  type ArtifactSkillKey,
  type AttributeKey,
  type ImportanceKey,
  type InputMode,
  type Level,
  type PrimaryOutput,
  type ToolKey,
} from './constants';
import {
  EndpointSlider,
  LevelPillGroup,
  PillChoiceGroup,
  SectionHeader,
  SectionRow,
  StructuredCheckboxGrid,
  type SectionAccent,
} from './primitives';
import { runAlgorithm } from './algorithm';
import { ComplexityBadge } from './ComplexityBadge';

export interface AdvancedRunSettingsProps {
  initialValue?: AdvancedRunSettingsValue;
  onChange?: (value: AdvancedRunSettingsValue) => void;
  onReset?: () => void;
  className?: string;
}

export function AdvancedRunSettings({
  initialValue = DEFAULT_ADVANCED_RUN_SETTINGS,
  onChange,
  onReset,
  className,
}: AdvancedRunSettingsProps) {
  const [value, setValue] = useState<AdvancedRunSettingsValue>(initialValue);

  const patch = useCallback(
    (partial: Partial<AdvancedRunSettingsValue>) => {
      setValue((prev) => {
        const next = { ...prev, ...partial };
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  const patchAttribute = useCallback(
    (key: AttributeKey, lvl: Level) => {
      patch({ attributes: { ...value.attributes, [key]: lvl } });
    },
    [patch, value.attributes],
  );

  const patchImportance = useCallback(
    (key: ImportanceKey, lvl: Level) => {
      patch({ importance: { ...value.importance, [key]: lvl } });
    },
    [patch, value.importance],
  );

  const handleReset = useCallback(() => {
    setValue(DEFAULT_ADVANCED_RUN_SETTINGS);
    onChange?.(DEFAULT_ADVANCED_RUN_SETTINGS);
    onReset?.();
  }, [onChange, onReset]);

  const algorithmResult = useMemo(() => runAlgorithm(value), [value]);

  return (
    <div className={cn('flex flex-col gap-6 w-full', className)}>
      <div className="flex items-center justify-end">
        <ComplexityBadge result={algorithmResult} />
      </div>

      <Section accent="blue" title="What do you need?">
        <SectionRow label="Primary Output">
          <PillChoiceGroup<PrimaryOutput>
            mode="single"
            options={PRIMARY_OUTPUTS}
            value={value.primaryOutput}
            onChange={(next) => patch({ primaryOutput: next as PrimaryOutput })}
          />
        </SectionRow>
        <SectionRow label="Input Modes">
          <PillChoiceGroup<InputMode>
            mode="multi"
            options={INPUT_MODES}
            value={value.inputModes}
            onChange={(next) => patch({ inputModes: next as InputMode[] })}
          />
        </SectionRow>
      </Section>

      <Section accent="violet" title="Model attributes">
        {ATTRIBUTES.map((attr) => (
          <SectionRow key={attr.id} label={attr.label}>
            <LevelPillGroup
              value={value.attributes[attr.id]}
              onChange={(lvl) => patchAttribute(attr.id, lvl)}
            />
          </SectionRow>
        ))}
      </Section>

      <Section accent="amber" title="How important are these?">
        {IMPORTANCE_ITEMS.map((item) => (
          <SectionRow key={item.id} label={item.label}>
            <EndpointSlider
              value={value.importance[item.id]}
              onChange={(lvl) => patchImportance(item.id, lvl)}
              startLabel="Not important"
              endLabel="Critical"
            />
          </SectionRow>
        ))}
      </Section>

      <Section accent="emerald" title="How hard should the model think?">
        <SectionRow label="Thinking depth">
          <LevelPillGroup
            value={value.thinkingLevel}
            onChange={(lvl) => patch({ thinkingLevel: lvl })}
          />
        </SectionRow>
      </Section>

      <Section accent="rose" title="Tools">
        <PillChoiceGroup<ToolKey>
          mode="multi"
          options={TOOLS}
          value={value.tools}
          onChange={(next) => patch({ tools: next as ToolKey[] })}
          className="flex-wrap"
        />
      </Section>

      <Section accent="indigo" title="What can the agent create?">
        <StructuredCheckboxGrid<ArtifactSkillKey>
          options={ARTIFACT_SKILLS}
          value={value.artifactSkills}
          onChange={(next) => patch({ artifactSkills: next })}
          columns={3}
        />
      </Section>

      <div className="flex items-center justify-end pt-2 border-t border-border">
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
            'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          )}
        >
          <RotateCcw className="h-3 w-3" />
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function Section({
  accent,
  title,
  children,
}: {
  accent: SectionAccent;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader accent={accent} title={title} />
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
