"use client";

import { AgentMemoryAllView } from "./AgentMemoryAllView";
import { MemoryComposer } from "./AgentMemoryEditor";
import {
  ALL_MEMORIES_ID,
  NEW_MEMORY_ID,
  type UseAgentMemoriesReturn,
} from "../hooks/useAgentMemories";

interface AgentMemoryBodyProps {
  state: UseAgentMemoriesReturn;
}

export function AgentMemoryBody({ state }: AgentMemoryBodyProps) {
  if (state.selectedId === NEW_MEMORY_ID) {
    return <MemoryComposer state={state} memory={null} />;
  }
  if (state.selectedMemory) {
    return <MemoryComposer state={state} memory={state.selectedMemory} />;
  }
  return <AgentMemoryAllView state={state} />;
}
