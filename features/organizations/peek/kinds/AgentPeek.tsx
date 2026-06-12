"use client";

/**
 * AgentPeek — adapter that maps the uniform PeekProps onto the existing,
 * feature-rich AgentSneakPeekModal. Agents have a bespoke peek already, so this
 * is just a thin bridge (it does NOT use PeekDialog).
 *
 * Example of the "bespoke modal" pattern; for the simple data-driven pattern see
 * FilePeek / NotePeek.
 */

import React from "react";
import { AgentSneakPeekModal } from "@/features/agents/components/agent-listings/AgentSneakPeekModal";
import type { PeekProps } from "../types";

export default function AgentPeek({ id, open, onClose }: PeekProps) {
  return <AgentSneakPeekModal agentId={id} isOpen={open} onClose={onClose} />;
}
