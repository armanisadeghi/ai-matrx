"use client";

import { AgentMemoryAllView } from "./AgentMemoryAllView";
import { MemoryDetailEditor, NewMemoryForm } from "./AgentMemoryEditor";
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
    return <NewMemoryForm state={state} />;
  }
  if (state.selectedId === ALL_MEMORIES_ID) {
    return <AgentMemoryAllView state={state} />;
  }
  if (state.selectedMemory) {
    return <MemoryDetailEditor memory={state.selectedMemory} state={state} />;
  }
  return <AgentMemoryAllView state={state} />;
}
