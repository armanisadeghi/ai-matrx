"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { hasField } from "@/features/agents/redux/shared/field-flags";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { fetchAgentOutputSchemas } from "@/features/mandates/output-contract";

/** Reads a bound contract through Redux, then the canonical cached by-id read. */
export function useBoundAgentOutputSchema(
  conversationId?: string,
): unknown | null {
  const agentId = useAppSelector(
    conversationId
      ? selectAgentIdFromInstance(conversationId)
      : () => undefined,
  );
  const agent = useAppSelector(
    agentId ? (state) => selectAgentById(state, agentId) : () => undefined,
  );
  const loadedSchema =
    agent && hasField(agent._loadedFields, "outputSchema")
      ? agent.outputSchema
      : undefined;
  const [fetched, setFetched] = useState<{
    agentId: string;
    schema: unknown | null;
  } | null>(null);

  useEffect(() => {
    if (!agentId || loadedSchema !== undefined) return;
    let active = true;
    void fetchAgentOutputSchemas([agentId]).then((schemas) => {
      if (active) setFetched({ agentId, schema: schemas[agentId] ?? null });
    });
    return () => {
      active = false;
    };
  }, [agentId, loadedSchema]);

  if (loadedSchema !== undefined) return loadedSchema;
  if (fetched && fetched.agentId === agentId) return fetched.schema;
  return null;
}
