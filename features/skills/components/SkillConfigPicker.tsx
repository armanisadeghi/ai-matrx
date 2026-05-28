"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  EyeOff,
  ListOrdered,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useSkills } from "../hooks/useSkills";
import type { SkillConfig, SkillRow } from "../types";

type Tier = "included" | "listed" | "forbidden";

interface SkillConfigPickerProps {
  /** Current value — never null; pass the empty default if absent. */
  value: SkillConfig;
  /** Called with the next value whenever the user adds/removes a chip or
   * flips the disable toggle. The container component dispatches into
   * Redux + marks dirty. */
  onChange: (next: SkillConfig) => void;
  /** When true, the picker is rendered read-only (e.g., when the parent
   * form has been saved). Defaults to false. */
  disabled?: boolean;
}

/** Three-tier visibility picker for `agx_agent.skill_config`. Backed by
 * the canonical skills slice — `useSkills` loads + listens for stream
 * events; the picker never holds its own list copy. */
export function SkillConfigPicker({
  value,
  onChange,
  disabled = false,
}: SkillConfigPickerProps) {
  const { skills, loading } = useSkills();

  const isDisabled = disabled || value.disabled;

  const move = (skillId: string, target: Tier | null) => {
    const stripped: SkillConfig = {
      included: value.included.filter((id) => id !== skillId),
      listed: value.listed.filter((id) => id !== skillId),
      forbidden: value.forbidden.filter((id) => id !== skillId),
      disabled: value.disabled,
    };
    if (target) {
      stripped[target] = [...stripped[target], skillId];
    }
    onChange(stripped);
  };

  const skillsById = useMemo(() => {
    const m: Record<string, SkillRow> = {};
    for (const s of skills) m[s.id] = s;
    return m;
  }, [skills]);

  // Build the "selected set" so the picker hides skills already placed.
  const selectedSet = useMemo(() => {
    const out = new Set<string>();
    for (const id of value.included) out.add(id);
    for (const id of value.listed) out.add(id);
    for (const id of value.forbidden) out.add(id);
    return out;
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={value.disabled}
          onCheckedChange={(v) =>
            onChange({ ...value, disabled: Boolean(v) })
          }
          disabled={disabled}
        />
        <Label className="text-sm">
          Disable skills for this agent — drops the skill preamble and
          capability for every turn.
        </Label>
      </div>

      <div
        className={cn(
          "rounded-md border border-border bg-card",
          isDisabled && "opacity-50 pointer-events-none",
        )}
      >
        <TierGroup
          tier="included"
          icon={Sparkles}
          label="Included"
          hint="Full skill body baked into the system preamble."
          ids={value.included}
          skillsById={skillsById}
          onRemove={(id) => move(id, null)}
          onPick={(id) => move(id, "included")}
          selectedSet={selectedSet}
          skills={skills}
          loading={loading}
          disabled={isDisabled}
        />
        <TierGroup
          tier="listed"
          icon={ListOrdered}
          label="Listed"
          hint="Name + description only — the agent can call skill_get to fetch."
          ids={value.listed}
          skillsById={skillsById}
          onRemove={(id) => move(id, null)}
          onPick={(id) => move(id, "listed")}
          selectedSet={selectedSet}
          skills={skills}
          loading={loading}
          disabled={isDisabled}
        />
        <TierGroup
          tier="forbidden"
          icon={EyeOff}
          label="Forbidden"
          hint="Hidden from search + listing — even the catalog overview omits these."
          ids={value.forbidden}
          skillsById={skillsById}
          onRemove={(id) => move(id, null)}
          onPick={(id) => move(id, "forbidden")}
          selectedSet={selectedSet}
          skills={skills}
          loading={loading}
          disabled={isDisabled}
          isLast
        />
      </div>

      {value.included.length + value.listed.length > 0 && value.forbidden.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
          A forbidden skill always wins over an included or listed one.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier group
// ---------------------------------------------------------------------------

function TierGroup({
  tier,
  icon: Icon,
  label,
  hint,
  ids,
  skillsById,
  onRemove,
  onPick,
  selectedSet,
  skills,
  loading,
  disabled,
  isLast,
}: {
  tier: Tier;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  ids: string[];
  skillsById: Record<string, SkillRow>;
  onRemove: (id: string) => void;
  onPick: (id: string) => void;
  selectedSet: Set<string>;
  skills: SkillRow[];
  loading: boolean;
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-3 py-3",
        !isLast && "border-b border-border/60",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          ({ids.length})
        </span>
      </div>
      <p className="text-xs text-muted-foreground/80 mb-2">{hint}</p>

      <div className="flex flex-wrap gap-1.5 items-center">
        {ids.length === 0 && (
          <span className="text-xs text-muted-foreground/70">
            No skills in this tier.
          </span>
        )}
        {ids.map((id) => {
          const row = skillsById[id];
          return (
            <Badge
              key={id}
              variant="secondary"
              className="gap-1 pr-1 font-normal"
              title={row ? row.description : id}
            >
              <span className="truncate max-w-[200px]">
                {row ? row.label : `(unknown ${id.slice(0, 8)})`}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  aria-label={`Remove ${row?.label ?? id}`}
                  className="inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          );
        })}

        {!disabled && (
          <SkillPickerPopover
            tier={tier}
            skills={skills}
            selectedSet={selectedSet}
            loading={loading}
            onPick={onPick}
          />
        )}
      </div>
    </div>
  );
}

function SkillPickerPopover({
  tier,
  skills,
  selectedSet,
  loading,
  onPick,
}: {
  tier: Tier;
  skills: SkillRow[];
  selectedSet: Set<string>;
  loading: boolean;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills
      .filter((s) => !selectedSet.has(s.id))
      .filter((s) => {
        if (!q) return true;
        return (
          s.label.toLowerCase().includes(q) ||
          s.skillId.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [skills, selectedSet, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs",
            "border border-dashed border-border text-muted-foreground",
            "hover:bg-accent hover:text-foreground transition-colors",
          )}
        >
          <Plus className="h-3 w-3" />
          Add skill
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills…"
          className="h-8 mb-2"
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          {loading && skills.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : available.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {search ? "No matches." : "All skills already placed."}
            </div>
          ) : (
            available.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onPick(s.id);
                  setSearch("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded",
                  "hover:bg-accent transition-colors",
                )}
              >
                <div className="text-sm text-foreground font-medium flex items-center gap-1.5">
                  {s.label}
                  {s.isSystem && (
                    <Badge
                      variant="outline"
                      className="h-3.5 px-1 text-[9px] font-normal text-muted-foreground gap-0.5"
                    >
                      <ShieldCheck className="h-2 w-2" />
                      System
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {s.description}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border mt-2 pt-2 text-xs text-muted-foreground">
          Pick → adds to {tier}. Already-placed skills are hidden.
        </div>
      </PopoverContent>
    </Popover>
  );
}

