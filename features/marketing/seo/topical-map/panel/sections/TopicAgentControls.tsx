"use client";

/**
 * The topic agent's two doors: "Rewrite description" and "Ask about this
 * topic". Both open `seo.topic_curation` IN PLACE through `useOpenMandateWindow`
 * (never a link to a mandate route), scoped to this surface so the window
 * loads only that job — and the agent receives the panel's values through the
 * surface runtime (R18), never `setContextEntries`, never `user_input`.
 *
 * ABSENT OR HONEST (the AutomationButton rule, 2026-08-31): while the mandate
 * does not resolve — no row yet (Lane S's holders are provisioned after this
 * lands), a disabled or holderless row — both controls render disabled with
 * the reason printed beside them, naming the key. A control that looks alive
 * and is not is the defect.
 *
 * WHAT A CLICK WILL DO is read from two knobs and printed, not guessed:
 * `topic_agent_change_mode` (apply | propose | ask — in `propose` the server
 * converts every write to a rolled-back dry run whose note the agent shows)
 * and `description_regeneration_mode` (automatic | queued | manual).
 */

import { BrainCircuit, PenLine } from "lucide-react";

import { useMandate } from "@/features/mandates/useMandate";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import { cn } from "@/lib/utils";

import type { MapAgentChangeMode, MapDescriptionRegenerationMode } from "../../knobs";
import { TOPICAL_MAP_SURFACE_NAME, TOPIC_CURATION_MANDATE_KEY } from "../topicCuration";

export interface TopicAgentControlsProps {
  changeMode: MapAgentChangeMode;
  regenerationMode: MapDescriptionRegenerationMode;
}

const CHANGE_MODE_LINE: Record<MapAgentChangeMode, string> = {
  apply: "changes are applied as the agent makes them",
  propose: "every change is proposed, never applied — the agent shows what it would have done",
  ask: "the agent asks before each change",
};

const REGENERATION_LINE: Record<MapDescriptionRegenerationMode, string> = {
  automatic: "the new description is written onto the topic",
  queued: "the new description is queued for review",
  manual: "the agent drafts it; you paste what you keep",
};

export function TopicAgentControls({ changeMode, regenerationMode }: TopicAgentControlsProps) {
  const { mandate, loading, absent, error } = useMandate(TOPIC_CURATION_MANDATE_KEY, {
    optional: true,
  });
  const openMandate = useOpenMandateWindow();
  const available = mandate !== null;

  // The panel floats over ANY page (a window on /chat, a peek on a note), so the
  // host page's manifest may not be this surface's; register the fixed job in
  // the top Agents menu from the control that runs it. Renders nothing.
  useDeclaredSurfaceMandates([
    {
      mandateKey: TOPIC_CURATION_MANDATE_KEY,
      does: "rewrites this topic's description and answers questions about it",
      surfaceName: TOPICAL_MAP_SURFACE_NAME,
    },
  ]);

  function open() {
    openMandate({
      initialMandateKey: TOPIC_CURATION_MANDATE_KEY,
      mandateKeys: [TOPIC_CURATION_MANDATE_KEY],
      surfaceName: TOPICAL_MAP_SURFACE_NAME,
      initialView: "yours",
    });
  }

  const reason = loading
    ? null
    : absent
      ? `Not available yet — this runs the job "${TOPIC_CURATION_MANDATE_KEY}", and no live job has that name. Once it is created these work, with no deploy.`
      : !available
        ? `Can't run "${TOPIC_CURATION_MANDATE_KEY}" right now: ${error ?? "it did not resolve"}.`
        : null;

  return (
    <div className="flex flex-col gap-1" data-testid="topic-agent-controls">
      <div className="flex flex-wrap items-center gap-1.5">
        <AgentButton
          icon={PenLine}
          label="Rewrite description"
          title={`Rewrite this topic's description — ${REGENERATION_LINE[regenerationMode]}`}
          disabled={!available}
          onClick={open}
        />
        <AgentButton
          icon={BrainCircuit}
          label="Ask about this topic"
          title={`Open the topic agent on this topic — ${CHANGE_MODE_LINE[changeMode]}`}
          disabled={!available}
          onClick={open}
        />
      </div>
      {reason ? (
        <p className="text-[11px] text-muted-foreground">{reason}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Rewrite: {REGENERATION_LINE[regenerationMode]}. Changes: {CHANGE_MODE_LINE[changeMode]}.
        </p>
      )}
    </div>
  );
}

function AgentButton({
  icon: Icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: typeof BrainCircuit;
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs",
        disabled
          ? "cursor-not-allowed text-muted-foreground opacity-60"
          : "bg-card text-foreground hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
