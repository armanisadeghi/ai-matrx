"use client";

// THE BUILDER SAYS WHAT THIS AGENT CAN DO, WITHOUT ANYONE OPENING ANYTHING.
//
// WHY THIS EXISTS. On 2026-09-19 the independent verifier walked the agent builder as the
// test admin and reported: "The builder showed no Tools panel at all. The page offered
// Model, Variables, Context, Resources, System and the message editor." That reading was
// correct about the screen and wrong about the code — the tools picker was there the whole
// time, as an unlabelled 28px wrench in a row of four bare icons beside the model name,
// while Variables, Context and Resources each got a labelled row of their own. A capability
// that only a person who already knows the icon can find is, for everybody else, absent.
//
// So Tools joins the other three: a labelled row that names, in plain words, every tool the
// agent carries, with an Add button that opens the same picker the wrench always opened.
// The wrench stays where it is for people who know it.

import { useEffect, useMemo } from "react";
import { Wrench, Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentMcpServers,
} from "@/features/agents/redux/agent-definition/selectors";
import { setAgentTools } from "@/features/agents/redux/agent-definition/slice";
import {
  selectAllTools,
  selectToolIdentityMap,
} from "@/features/agents/redux/tools/tools.selectors";
import {
  fetchAvailableTools,
  fetchToolById,
} from "@/features/agents/redux/tools/tools.thunks";
import { AgentToolsModal } from "@/features/agents/components/tools-management/AgentToolsModal";

interface AgentToolsRowProps {
  agentId: string;
}

/** A tool's name as a person writes it: "record_write" reads "Record write". */
function humanToolName(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function AgentToolsRow({ agentId }: AgentToolsRowProps) {
  const dispatch = useAppDispatch();
  const toolIds = useAppSelector((state) => selectAgentTools(state, agentId));
  const customTools = useAppSelector((state) =>
    selectAgentCustomTools(state, agentId),
  );
  const mcpServers = useAppSelector((state) =>
    selectAgentMcpServers(state, agentId),
  );
  const catalog = useAppSelector(selectAllTools);
  const identityById = useAppSelector(selectToolIdentityMap);

  // The catalogue is what turns an id into a word. Every other consumer fetched
  // it only when the picker opened, which is exactly the gesture this row exists
  // to make unnecessary.
  useEffect(() => {
    void dispatch(fetchAvailableTools());
  }, [dispatch]);

  const selected = useMemo(
    () => (Array.isArray(toolIds) ? toolIds : []),
    [toolIds],
  );

  const byId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const tool of catalog) map.set(tool.id, tool);
    for (const [id, tool] of Object.entries(identityById ?? {})) {
      if (!map.has(id) && tool) map.set(id, tool);
    }
    return map;
  }, [catalog, identityById]);

  // A TOOL THIS AGENT CARRIES IS NEVER SHOWN AS AN ID. The picker's catalogue is
  // filtered by organization eligibility (lib/knobs/toolKnobGating.ts), so an
  // agent can legitimately carry a tool the catalogue withholds; that one is
  // resolved by identity instead of printed as a uuid.
  useEffect(() => {
    for (const id of selected) {
      if (!byId.has(id)) void dispatch(fetchToolById(id));
    }
  }, [dispatch, selected, byId]);

  const remove = (id: string) => {
    dispatch(
      setAgentTools({ id: agentId, tools: selected.filter((t) => t !== id) }),
    );
  };

  const customCount = Array.isArray(customTools) ? customTools.length : 0;
  const mcpCount = Array.isArray(mcpServers) ? mcpServers.length : 0;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label className="shrink-0 text-xs text-muted-foreground">Tools</Label>

      <ScrollFade
        orientation="horizontal"
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 py-0.5"
      >
        {selected.length === 0 && customCount === 0 && mcpCount === 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground/70">
            None yet — Add gives this agent something it can do
          </span>
        ) : null}

        {selected.map((id) => {
          const tool = byId.get(id);
          return (
            <span
              key={id}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs"
              title={tool?.name ?? "Loading this tool's name…"}
            >
              <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="max-w-[140px] truncate">
                {tool ? humanToolName(tool.name) : "Loading…"}
              </span>
              <button
                type="button"
                aria-label={`Remove ${tool ? humanToolName(tool.name) : "this tool"}`}
                title="Remove from this agent"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => remove(id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}

        {customCount > 0 ? (
          <span className="shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs">
            {customCount} custom
          </span>
        ) : null}
        {mcpCount > 0 ? (
          <span className="shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs">
            {mcpCount} connected service{mcpCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </ScrollFade>

      <div className="flex shrink-0 items-center gap-1">
        <AgentToolsModal
          agentId={agentId}
          renderTrigger={(open) => (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={open}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          )}
        />
      </div>
    </div>
  );
}
