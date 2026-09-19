"use client";

import { useAppDispatch } from "@/lib/redux/hooks";
import { DecisionPlayground } from "./DecisionPlayground";
import { loadDecision, runDecision } from "./decision-api";

export function DecisionsPageClient() {
  const dispatch = useAppDispatch();
  return <DecisionPlayground onRun={(input) => runDecision(dispatch, input)} onLoad={(executionId) => loadDecision(dispatch, executionId)} />;
}
