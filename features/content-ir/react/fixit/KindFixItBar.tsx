"use client";

/**
 * THE FIX-IT BAR (ratified by Arman, 2026-08-27).
 *
 * When a settled kind value fell back to the generic viewer, this bar sits at
 * the top of the fallback and does two jobs:
 *   1. tells EVERY viewer, in one plain sentence, why the value is not
 *      rendering as itself — no secrets;
 *   2. gives anyone with the rights the ONE-CLICK repair, right there:
 *      activate the kind (seeding the on-screen instance as its example when
 *      the gate needs one), re-enable a disabled component, or launch the
 *      builder agent pre-loaded with this kind and this exact value.
 *
 * THE LAZY LAW: none of this runs on a successful render. The diagnosis fires
 * only after the fallback is already on screen, once per kind per session
 * (see diagnose-kind-render-gap), and never while the value is still
 * streaming (a half-arrived payload must not be offered as an example).
 */

import React, { useContext, useEffect, useState } from "react";
import { BrainCircuit, CircleAlert, Loader2, Power, Wrench } from "lucide-react";
import { ReactReduxContext } from "react-redux";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsSuperAdmin,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { resolveMandate } from "@/features/agents/mandates/service";
import { KIND_CREATOR_MANDATE_KEY } from "../../studio/constants";
import { composeKindAgentIntent } from "../../studio/kind-agent-intents";
import type { Json } from "@/types/database.types";
import {
  diagnoseKindRenderGap,
  type KindRenderGapDiagnosis,
} from "./diagnose-kind-render-gap";
import {
  activateKindUsingInstance,
  reactivateComponent,
} from "./fixit-actions";

export interface KindFixItBarProps {
  kind: string;
  /** The settled instance value (drives example seeding + the agent seed). */
  value: unknown;
}

/** Instance JSON handed to the builder agent, capped so a giant payload
 * doesn't blow the seed — the agent can fetch more through its tools. */
function instanceNote(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (!text) return "";
    const capped = text.length > 6000 ? `${text.slice(0, 6000)}\n… (truncated)` : text;
    return `Design against this REAL instance the user was looking at:\n\`\`\`json\n${capped}\n\`\`\``;
  } catch {
    return "";
  }
}

function sentenceFor(d: KindRenderGapDiagnosis): string | null {
  switch (d.state) {
    case "unregistered":
      return `"${d.kind}" is not a registered shape, so it can only render as raw data.`;
    case "no_component":
      return `${d.kindLabel ?? d.kind} has no component yet, so it renders through the generic viewer.`;
    case "component_inactive":
      return `${d.kindLabel ?? d.kind} has a component (${d.inactiveComponentKey}) but it is currently disabled.`;
    case "component_empty":
      return `${d.kindLabel ?? d.kind} has a component entry with no code inside, so it cannot render.`;
    case "kind_inactive":
      return `${d.kindLabel ?? d.kind} is not activated yet — it renders, but it can't be picked or bound until someone activates it.`;
    case "generic_is_truth":
      return null;
  }
}

/**
 * Outer shell: the bar needs the app's Redux store (viewer identity, agent
 * window). A host without one — a unit test, a bare preview — gets nothing
 * rather than a throw; the truth strip on the shape pages covers those.
 */
export const KindFixItBar: React.FC<KindFixItBarProps> = (props) => {
  const store = useContext(ReactReduxContext);
  if (!store) return null;
  return <KindFixItBarInner {...props} />;
};

const KindFixItBarInner: React.FC<KindFixItBarProps> = ({ kind, value }) => {
  const userId = useAppSelector(selectUserId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const openRun = useOpenAgentRunWindow();
  const [diagnosis, setDiagnosis] = useState<KindRenderGapDiagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolvedNote, setResolvedNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void diagnoseKindRenderGap(kind).then((result) => {
      if (alive) setDiagnosis(result);
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  if (!diagnosis || resolvedNote === "hidden") {
    return null;
  }
  const sentence = sentenceFor(diagnosis);
  if (!sentence) return null;

  const canAct =
    isSuperAdmin ||
    (userId !== null &&
      (diagnosis.kindCreatedBy === userId ||
        diagnosis.inactiveComponentCreatedBy === userId ||
        diagnosis.state === "unregistered"));

  const runAction = (label: string, action: () => Promise<void>) => {
    setBusy(true);
    void action()
      .then(() => {
        toast.success(label);
        setResolvedNote("hidden");
      })
      .catch((error: unknown) => {
        toast.error(`${label} failed`, {
          description: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => setBusy(false));
  };

  const launchBuilder = (brief: "component" | "register") => {
    setBusy(true);
    void resolveMandate(KIND_CREATOR_MANDATE_KEY)
      .then((resolved) => {
        const seed =
          brief === "component"
            ? composeKindAgentIntent({
                kind: diagnosis.kind,
                label: diagnosis.kindLabel ?? diagnosis.kind,
                part: "component",
                emittedJsonSchema: diagnosis.emittedJsonSchema as Json | null,
                note: instanceNote(value),
              })
            : {
                draftText: "Let's do it.",
                variables: {
                  task_brief:
                    `Register the shape (kind) \`${diagnosis.kind}\` — it is already being emitted by a live agent but has no registration. ` +
                    `Derive the schema from the real instance below, keep the slug EXACTLY \`${diagnosis.kind}\`, then build its output component.\n\n` +
                    instanceNote(value),
                  kind_schema: "",
                },
              };
        openRun({
          initialAgentId: resolved.agentId,
          initialDraftText: seed.draftText,
          initialVariableValues: seed.variables,
        });
      })
      .catch((error: unknown) => {
        toast.error("The Shape builder agent is unavailable", {
          description: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => setBusy(false));
  };

  const button = (() => {
    if (!canAct) return null;
    switch (diagnosis.state) {
      case "component_inactive":
        return (
          <ActionButton
            busy={busy}
            icon={Power}
            label="Re-activate component"
            onClick={() =>
              runAction("Component re-activated", () =>
                reactivateComponent(diagnosis),
              )
            }
          />
        );
      case "kind_inactive":
        return (
          <ActionButton
            busy={busy}
            icon={Power}
            label="Activate kind"
            onClick={() =>
              runAction("Kind activated", () =>
                activateKindUsingInstance(diagnosis, value),
              )
            }
          />
        );
      case "no_component":
        return (
          <ActionButton
            busy={busy}
            icon={BrainCircuit}
            label="Build component"
            onClick={() => launchBuilder("component")}
          />
        );
      case "component_empty":
        return (
          <ActionButton
            busy={busy}
            icon={Wrench}
            label="Fix with agent"
            onClick={() => launchBuilder("component")}
          />
        );
      case "unregistered":
        return (
          <ActionButton
            busy={busy}
            icon={BrainCircuit}
            label="Build kind & component"
            onClick={() => launchBuilder("register")}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/35 bg-amber-500/[0.07] px-2.5 py-1.5">
      <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 text-xs leading-snug text-amber-800 dark:text-amber-300">
        {sentence}
      </p>
      {button}
    </div>
  );
};

function ActionButton({
  busy,
  icon: Icon,
  label,
  onClick,
}: {
  busy: boolean;
  icon: typeof Power;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-amber-500 dark:text-amber-950"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}
