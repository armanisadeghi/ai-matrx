"use client";

/**
 * SkillDetailView
 *
 * Read-only detail pane for a single skill — the "what does this skill
 * actually say?" surface. Renders the full markdown body plus the metadata
 * that decides how the runtime treats the skill (type, tools, triggers,
 * model preference, version, category).
 *
 * Deliberately read-only: editing lives in `SkillDetailEditor` (the
 * agent-connections Skills section / admin registry). This pane exists so a
 * user configuring an agent can READ a skill before assigning it — the
 * assignment tier buttons are rendered here too so they never have to go
 * back to the list to act on what they just read.
 */

import * as React from "react";
import {
  ArrowLeft,
  Check,
  Shapes,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import MarkdownStream from "@/components/MarkdownStream";
import { cn } from "@/lib/utils";

import type { SkillRow } from "../types";
import { SKILL_TIER_META, SKILL_TIER_ORDER, type SkillTierKey } from "./skill-tiers";

interface SkillDetailViewProps {
  skill: SkillRow;
  categoryLabel?: string;
  /** Current assignment tier for this skill on the agent being configured. */
  tier: SkillTierKey | null;
  onMove: (tier: SkillTierKey | null) => void;
  onBack: () => void;
  disabled?: boolean;
}

export function SkillDetailView({
  skill,
  categoryLabel,
  tier,
  onMove,
  onBack,
  disabled = false,
}: SkillDetailViewProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-6 w-6 shrink-0"
            onClick={onBack}
            aria-label="Back to skill list"
            title="Back to skill list"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {skill.label}
              </h3>
              {skill.isSystem && (
                <Badge
                  variant="outline"
                  className="h-5 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground"
                >
                  <ShieldCheck className="h-3 w-3" />
                  System
                </Badge>
              )}
              {!skill.isActive && (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400"
                >
                  Inactive
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
              {skill.skillId}
            </p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {SKILL_TIER_ORDER.map((candidate) => {
            const meta = SKILL_TIER_META[candidate];
            const Icon = meta.icon;
            const active = tier === candidate;
            return (
              <button
                key={candidate}
                type="button"
                onClick={() => onMove(active ? null : candidate)}
                disabled={disabled}
                aria-pressed={active}
                title={`${meta.label}: ${meta.hint}`}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
                  active
                    ? meta.activeClass
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                  disabled && "cursor-not-allowed",
                )}
              >
                {active ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Radix sizes the viewport's inner wrapper as a table, so it grows to
          the intrinsic width of the markdown instead of the pane. Forcing it
          back to a block is what keeps long lines wrapping inside the column. */}
      <ScrollArea className="min-h-0 flex-1 [&>div>div]:!block [&>div>div]:!min-w-0">
        <div className="min-w-0 space-y-4 px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {skill.description || "No description provided."}
          </p>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
            <MetaRow label="Type" value={skill.skillType} />
            {categoryLabel && <MetaRow label="Category" value={categoryLabel} />}
            {skill.version && <MetaRow label="Version" value={skill.version} />}
            {skill.modelPreference && (
              <MetaRow label="Model" value={skill.modelPreference} />
            )}
            {skill.platformTargets.length > 0 && (
              <MetaRow
                label="Platforms"
                value={skill.platformTargets.join(", ")}
              />
            )}
            <MetaRow
              label="Auto-invoke"
              value={skill.disableAutoInvocation ? "Disabled" : "Enabled"}
            />
          </dl>

          {skill.allowedTools.length > 0 && (
            <ChipSection
              icon={Wrench}
              title="Allowed tools"
              items={skill.allowedTools}
            />
          )}
          {skill.triggerPatterns.length > 0 && (
            <ChipSection
              icon={Zap}
              title="Trigger patterns"
              items={skill.triggerPatterns}
            />
          )}

          <section>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Shapes className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Instructions
              </h4>
            </div>
            {skill.body && skill.body.trim() ? (
              <div className="min-w-0 overflow-x-auto rounded-md border border-border bg-card px-3 py-2">
                <MarkdownStream content={skill.body} />
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground/70">
                This skill has no instruction body. Only its name and
                description reach the agent.
              </p>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground/80">{label}</dt>
      <dd className="min-w-0 truncate text-foreground">{value}</dd>
    </>
  );
}

function ChipSection({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Wrench;
  title: string;
  items: string[];
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
