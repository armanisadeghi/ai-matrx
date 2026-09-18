"use client";

/**
 * Pick the agent a selection's test cases are for.
 *
 * "Use as test cases for an agent…" declares `agent_id` in its params schema
 * (§8), and a uuid is not something a person has. This is the twin of
 * `RulebookParamPicker` and follows the same law: a control that names a record
 * must be able to REACH that record, never ask for its id.
 *
 * 🚨 THERE IS ONE AGENT PICKER, and it is `AgentListDropdown` from
 * `@ai-matrx/agents/catalog/react` — the same control the research wiring
 * dashboard, the chat sidebar and the context builder use, enforced in CI by
 * `pnpm check:canonical-pickers`. This file is a thin binding of that picker to
 * one param, never a second picker: a local list would have its own idea of
 * which agents exist, its own scope tabs, and its own bugs.
 *
 * Unlike the Rulebook picker there is deliberately NO "create one" line. An
 * agent is not a container you make on the way to somewhere else — it is the
 * thing being built, with its own instructions, variables and model, and
 * creating an empty one from a Library confirm would produce exactly the
 * unusable shell the platform's "agents are never authored in passing" rule
 * exists to prevent. When a person has no agent yet, the picker says so in
 * words and points at where agents are made.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Bot, ChevronDown } from "lucide-react";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";

export function AgentParamPicker({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string | null;
    onChange: (next: string | null) => void;
}) {
    const dispatch = useAppDispatch();
    const agents = useAppSelector(selectAllAgents);

    // The canonical list, loaded through the agent-definition slice — never a raw
    // `agent.definition` query from inside this feature.
    useEffect(() => {
        void dispatch(fetchAgentsList());
    }, [dispatch]);

    // `selectAllAgents` is the registry RECORD, keyed by id — not an array. Reading
    // it as one type-checked as `any` and answered `undefined` at run time, which is
    // how a picker shows "Choose an agent" over an agent that is already chosen.
    const chosenName = useMemo(() => {
        if (!value) return null;
        const found = agents[value];
        return (found?.name as string | undefined) ?? null;
    }, [agents, value]);

    return (
        <div className="space-y-1.5">
            <Label htmlFor="param-agent_id">{label}</Label>
            <AgentListDropdown
                consumerId="source-library-test-cases-agent"
                activeAgentId={value}
                onSelect={(agentId: string) => onChange(agentId || null)}
                label={chosenName ?? "Choose an agent"}
                showPinnedAgent={Boolean(value)}
                triggerSlot={
                    <Button
                        type="button"
                        variant="outline"
                        id="param-agent_id"
                        className="h-11 w-full justify-between font-normal"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                                {chosenName ??
                                    (value ? "This agent" : "Choose an agent")}
                            </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                }
            />
            <p className="text-xs text-muted-foreground">
                The test cases appear under <strong>Candidates</strong> in that agent&apos;s
                Test cases panel, on its Build page.{" "}
                <Link href="/agents/all" className="underline underline-offset-2">
                    See your agents
                </Link>
                .
            </p>
        </div>
    );
}
