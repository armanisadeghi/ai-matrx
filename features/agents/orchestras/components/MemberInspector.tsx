// features/agents/orchestras/components/MemberInspector.tsx
//
// Right-side editor for one Orchestra member: name the role it plays and describe the
// gap it fills (seeded from the agent's own description). This is what turns a
// raw agent into a defined part of the bigger picture.

"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Play, Trash2, Webhook, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { removeAgentFromOrchestra, saveMemberMeta } from "@/features/agents/redux/orchestras/thunks";
import { AgentPeekButton } from "./AgentPeekButton";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AgentIODetails } from "./AgentIODetails";
import { accentClasses } from "./accents";
import {
  DEFAULT_ORCHESTRA_RESULT_MODE,
  ORCHESTRA_RESULT_MODES,
  ORCHESTRA_RESULT_MODE_META,
  type OrchestraAccent,
  type OrchestraResultMode,
} from "../constants";
import type { OrchestraMember } from "../types";

export interface MemberInspectorProps {
  conductorId: string;
  member: OrchestraMember;
  accent: OrchestraAccent;
  onClose: () => void;
}

export function MemberInspector({ conductorId, member, accent, onClose }: MemberInspectorProps) {
  const dispatch = useAppDispatch();
  const a = accentClasses(accent);
  const agent = useAppSelector((s) => selectAgentById(s, member.agentId));

  // Seeded once from props; the parent remounts this panel via `key={agentId}`
  // when a different member is selected, so no setState-in-effect re-seed.
  const [roleTitle, setRoleTitle] = useState(member.roleTitle ?? "");
  const [gap, setGap] = useState(member.gap ?? "");
  const [required, setRequired] = useState(member.required === true);
  const [resultMode, setResultMode] = useState<OrchestraResultMode>(
    member.resultMode ?? DEFAULT_ORCHESTRA_RESULT_MODE,
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    roleTitle !== (member.roleTitle ?? "") ||
    gap !== (member.gap ?? "") ||
    required !== (member.required === true) ||
    resultMode !== (member.resultMode ?? DEFAULT_ORCHESTRA_RESULT_MODE);

  const handleSave = async () => {
    setSaving(true);
    const res = await dispatch(
      saveMemberMeta({
        conductorId,
        agentId: member.agentId,
        meta: {
          roleTitle: roleTitle.trim(),
          gap: gap.trim(),
          pos: member.pos ?? undefined,
          required,
          resultMode,
        },
        // A person just typed this. Whatever the AI drafted, a human has now
        // verified it — grounding "V" (Engram §4.5).
        groundingTag: "V",
      }),
    );
    setSaving(false);
    if (!res.ok) toast.error(res.error ?? "Could not save.");
    else toast.success("Role saved.");
  };

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border p-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm", a.glyph)}>
          <Webhook className="h-4 w-4" />
        </div>
        <div className="group/entity-ref min-w-0 flex-1">
          {/* THE DOOR LAW: the inspector names the member agent, so it opens
              it. No invented label — an unloaded agent shows its id, not the
              word "Member". */}
          <div className="truncate text-sm font-semibold text-foreground">
            <EntityRef
              token="agent"
              id={member.agentId}
              name={agent?.name ?? null}
              showIcon={false}
              disablePeek
            />
          </div>
          <div className="text-[11px] text-muted-foreground">Member role</div>
        </div>
        <AgentPeekButton agentId={member.agentId} />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Role title</label>
          <Input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder={agent?.category || "e.g. Generator, Grader, Tutor"}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">The gap it fills</label>
            {agent?.description && gap !== agent.description && (
              <button
                type="button"
                onClick={() => setGap(agent.description ?? "")}
                className={cn("text-[11px] font-medium hover:underline", a.text)}
              >
                Use description
              </button>
            )}
          </div>
          <textarea
            value={gap}
            onChange={(e) => setGap(e.target.value)}
            placeholder={agent?.description || "What does this agent contribute to the Orchestra?"}
            rows={5}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Designated member (C-26): runtime-enforced — the conductor cannot
            finish cleanly without successfully consulting this member. */}
        <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3">
          <div className="min-w-0 space-y-0.5">
            <label htmlFor="member-required" className="text-xs font-medium text-foreground">
              Must be consulted
            </label>
            <p className="text-[11px] leading-snug text-muted-foreground">
              The conductor has to bring this member in before it can finish.
              If it tries to skip them, it is corrected automatically — and a run
              that still skips them is never marked complete.
            </p>
          </div>
          <Switch id="member-required" checked={required} onCheckedChange={setRequired} />
        </div>

        {/* How its result comes back (D-40). This is the Orchestra's defining
            power: the leader can route a member's answer onward WITHOUT
            holding it in its own context. */}
        <div className="space-y-1.5 rounded-md border border-border bg-background p-3">
          <label className="text-xs font-medium text-foreground">
            When this member answers
          </label>
          <div className="space-y-1.5 pt-0.5">
            {ORCHESTRA_RESULT_MODES.map((mode) => {
              const meta = ORCHESTRA_RESULT_MODE_META[mode];
              const selected = resultMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setResultMode(mode)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full rounded-md border p-2 text-left transition-colors",
                    selected
                      ? cn("border-transparent ring-1", a.ring, a.soft)
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <div
                    className={cn(
                      "text-[11px] font-medium",
                      selected ? a.text : "text-foreground",
                    )}
                  >
                    {meta.label}
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {meta.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agent I/O — what this member consumes + produces (lazy-loaded full def) */}
        <AgentIODetails agentId={member.agentId} accent={accent} />

        <div className="flex flex-wrap gap-1.5">
          <Link href={`/agents/${member.agentId}/build`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </Button>
          </Link>
          <Link href={`/agents/${member.agentId}/run`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Run
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            dispatch(removeAgentFromOrchestra({ conductorId, agentId: member.agentId }));
            onClose();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
