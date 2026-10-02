"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { upsertAgent } from "@/features/agents/redux/agent-definition/slice";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

export function AgentHydrator({ definition }: { definition: AgentDefinition }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(upsertAgent(definition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.id]);

  return null;
}
