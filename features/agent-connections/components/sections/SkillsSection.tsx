"use client";

import React, { useMemo, useState } from "react";
import { Lightbulb, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SectionToolbar } from "../SectionToolbar";
import { GroupSection } from "../GroupSection";
import { ListRow } from "../ListRow";
import { SectionFooter } from "../SectionFooter";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { SKILL_TYPE_LABELS, SKILL_TYPES } from "../../constants";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { SkillRow } from "@/features/skills/types";

/** Best-effort label lookup — falls back to a Title-Cased version of the raw
 * type when the value isn't in the known SKILL_TYPES list (the backend wire
 * shape is free-string by design). */
function labelForType(skillType: string): string {
  if ((SKILL_TYPES as readonly string[]).includes(skillType)) {
    return SKILL_TYPE_LABELS[skillType as (typeof SKILL_TYPES)[number]];
  }
  return skillType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SkillsSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [search, setSearch] = useState("");
  const { skills, loading, error } = useSkills();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.skillId.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
    );
  }, [skills, search]);

  const groups = useMemo(() => {
    const map: Record<string, SkillRow[]> = {};
    for (const s of filtered) {
      (map[s.skillType] ??= []).push(s);
    }
    // Ordered groups: known types first (in declared SKILL_TYPES order),
    // then anything else the backend returned, alphabetised.
    const known = SKILL_TYPES.filter((t) => (map[t]?.length ?? 0) > 0);
    const unknown = Object.keys(map)
      .filter((t) => !(SKILL_TYPES as readonly string[]).includes(t))
      .sort();
    return [...known, ...unknown].map((type) => ({
      type,
      label: labelForType(type),
      items: map[type]!,
    }));
  }, [filtered]);

  const selected = selectedItemId
    ? (skills.find((s) => s.id === selectedItemId) ?? null)
    : null;

  if (selected) {
    return (
      <SkillDetail
        skill={selected}
        onBack={() => dispatch(setSelectedItemId(null))}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        generateLabel="Generate Skill"
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && skills.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading skills…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search ? "No skills match your search." : "No skills yet."}
          </div>
        ) : (
          groups.map((g) => (
            <GroupSection key={g.type} label={g.label} count={g.items.length}>
              {g.items.map((item) => (
                <ListRow
                  key={item.id}
                  icon={Lightbulb}
                  title={item.label}
                  subtitle={item.description}
                  onClick={() => dispatch(setSelectedItemId(item.id))}
                />
              ))}
            </GroupSection>
          ))
        )}
      </div>
      <SectionFooter
        description="Reusable skills that provide domain-specific knowledge and workflows to agents. Loaded with progressive disclosure — descriptions first, body on invocation."
        learnMoreLabel="Learn more about skills"
        learnMoreHref="#"
      />
    </div>
  );
}

function SkillDetail({
  skill,
  onBack,
}: {
  skill: SkillRow;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/40">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-md",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {skill.label}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {skill.skillId} · {labelForType(skill.skillType)}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin p-4 space-y-3 text-sm">
        <DetailField label="skill_id" value={skill.skillId} mono />
        <DetailField label="Type" value={labelForType(skill.skillType)} />
        <DetailField label="Description" value={skill.description} />
        <DetailField
          label="Model preference"
          value={skill.modelPreference ?? "—"}
        />
        <DetailField label="Version" value={skill.version ?? "—"} />
        <DetailField
          label="Auto invocation"
          value={skill.disableAutoInvocation ? "Disabled" : "Enabled"}
        />
        <DetailField
          label="Visibility"
          value={
            skill.isSystem ? "System" : skill.isPublic ? "Public" : "Private"
          }
        />
        <DetailField
          label="Platforms"
          value={
            skill.platformTargets?.length
              ? skill.platformTargets.join(", ")
              : "All"
          }
        />
        <DetailField
          label="Triggers"
          value={
            (skill.triggerPatterns?.length ?? 0) > 0
              ? `${skill.triggerPatterns?.length} pattern(s)`
              : "—"
          }
        />
        {skill.body && (
          <div className="pt-3 border-t border-border/40">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Body
            </div>
            <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md whitespace-pre-wrap">
              {skill.body}
            </pre>
          </div>
        )}
        <p className="text-xs text-muted-foreground pt-4 border-t border-border/40">
          Full normalized / source editor coming with the DetailEditor rollout.
        </p>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </div>
      <div
        className={cn(
          "flex-1 text-sm break-words",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default SkillsSection;
