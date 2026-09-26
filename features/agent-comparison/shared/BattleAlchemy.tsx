"use client";

/**
 * BattleAlchemy — the battle-wide Alchemy menu in the battle header.
 *
 * One control for the whole battle: copy it for a person, copy or prepare it
 * for an AI, download it (Markdown, JSON, a CSV of scores and run numbers),
 * send it to a sheet, save it to Notes, email it, or continue with an agent —
 * every destination the Alchemy package already owns. The data is read at the
 * moment of the click from the mode on screen (`buildBattleSnapshot`), so it is
 * always what the person sees, blind masking included.
 *
 * Absent when there is nothing to hand over yet (no columns): a control is
 * absent or honest, never dead.
 */

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  csvExportItem,
  jsonExportItem,
  textExportItem,
} from "@/components/agent-copy/export";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { fetchModelIdentityById } from "@/features/ai-models/redux/modelRegistrySlice";
import { selectActiveBattleColumns } from "./activeBattleColumns";
import {
  battleMarkdown,
  battleModelIds,
  battleRows,
  buildBattleSnapshot,
  type BattleSnapshot,
} from "./battleSnapshot";

export function BattleAlchemy() {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectActiveBattleColumns);

  // Load the names of the models this battle compares, so every copy names
  // them. The thunk skips ids it already has or is already fetching.
  const modelIdsKey = useAppSelector((state) => battleModelIds(state).join(","));
  useEffect(() => {
    for (const id of modelIdsKey ? modelIdsKey.split(",") : []) {
      void dispatch(fetchModelIdentityById(id));
    }
  }, [modelIdsKey, dispatch]);

  if (columns.length === 0) return null;

  const snapshot = (): BattleSnapshot => {
    const snap = buildBattleSnapshot(store.getState());
    if (!snap) {
      throw new Error("No battle is on screen any more; reopen it and try again.");
    }
    return snap;
  };

  const payload = (
    snap: BattleSnapshot,
    focus: "everything" | "answers" | "scores",
  ): AgentPayloadInput => {
    const data =
      focus === "answers"
        ? {
            ...snap,
            columns: snap.columns.map(({ label, variant, own_request, answer, error, failed }) => ({
              label,
              variant,
              own_request,
              answer,
              error,
              failed,
            })),
          }
        : focus === "scores"
          ? {
              mode_label: snap.mode_label,
              varies: snap.varies,
              battle: snap.battle,
              agent: snap.agent,
              blind: snap.blind,
              rubric: snap.rubric,
              columns: battleRows(snap).map(({ answer: _answer, ...rest }) => rest),
            }
          : snap;
    const ran = snap.columns.filter((c) => c.status === "ran").length;
    const rated = snap.columns.filter((c) => c.feedback).length;
    return {
      kind: "agent-battle",
      location: `AI Matrx — ${snap.mode_label}${snap.battle ? ` "${snap.battle.name}"` : ""}`,
      description: `A side-by-side comparison of ${snap.columns.length} columns that varies ${snap.varies}. ${
        focus === "answers"
          ? "Each column's answer, with what made it different."
          : focus === "scores"
            ? "The person's scores and each column's run numbers."
            : "Setup, every column's request, answer, scores and run numbers."
      }`,
      summary: battleMarkdown(snap, {
        answers: focus !== "scores",
        scores: focus !== "answers",
      }),
      data,
      attributes: {
        mode: snap.mode,
        columns: snap.columns.length,
        columns_ran: ran,
        columns_rated: rated,
        blind: snap.blind.active && !snap.blind.revealed,
        battle_id: snap.battle?.id ?? null,
      },
      context: snap.battle?.url ? { battle_url: snap.battle.url } : undefined,
    };
  };

  const label = "This battle";

  return (
    <CopyButtons
      label={label}
      size="sm"
      triggerVariant="glass"
      human={() => battleMarkdown(snapshot())}
      json={() => snapshot()}
      agent={() => payload(snapshot(), "everything")}
      agentVariant={{
        id: "everything",
        label: "Everything in this battle",
        hint: "Setup, each column's request and answer, your scores and run numbers",
        position: "first",
      }}
      aiVariants={[
        {
          id: "answers",
          label: "Answers side by side",
          hint: "What each column varied and what it answered",
          build: () => payload(snapshot(), "answers"),
        },
        {
          id: "scores",
          label: "Scores and run numbers",
          hint: "Your ratings, ranks and each column's tokens, cost and time",
          build: () => payload(snapshot(), "scores"),
        },
      ]}
      export={{
        items: [
          textExportItem(() => battleMarkdown(snapshot()), "Markdown (.md)", "md"),
          jsonExportItem(() => snapshot(), "JSON (full battle)"),
          csvExportItem(() => battleRows(snapshot()), "CSV (scores and run numbers)"),
        ],
        sheetRows: () => battleRows(snapshot()),
      }}
    />
  );
}
