"use client";

// features/workflow-runtime/listings/core/WorkflowSneakPeek.tsx
//
// THE WORKFLOW SNEAK PEEK — the workflow half of the affordance the agent
// picker has had all along: look inside the record without leaving the picker,
// and copy the definition out of it.
//
// The agent peek shows an agent's real substance (messages, variables, tools,
// output schema). A workflow's substance is its GRAPH, so this shows the steps
// in order with their spec types, what it declares it takes and delivers, its
// variables, and the JSON — the same promise kept for a different shape.

import { useEffect, useState } from "react";
import {
  Braces,
  CircleAlert,
  Copy,
  Check,
  Loader2,
  Variable,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { fetchWorkflowPeek, type WorkflowPeek } from "../service";

/** One in-flight read per workflow, shared by the peek body and the copy menu. */
function useWorkflowPeek(workflowId: string, active: boolean) {
  const [peek, setPeek] = useState<WorkflowPeek | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "ready" | "failed">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    if (peek?.id === workflowId) return undefined;
    let live = true;
    setState("reading");
    setError(null);
    void (async () => {
      try {
        const result = await fetchWorkflowPeek(workflowId);
        if (!live) return;
        setPeek(result);
        setState(result ? "ready" : "failed");
        if (!result) {
          setError("This workflow could not be read — it may have been deleted.");
        }
      } catch (err: unknown) {
        if (!live) return;
        setState("failed");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [workflowId, active, peek?.id]);

  return { peek: peek?.id === workflowId ? peek : null, state, error };
}

function stepLabel(node: WorkflowPeek["definition"]["nodes"][number]): string {
  const label = node.data?.label;
  return typeof label === "string" && label.trim() ? label : node.id;
}

function stepType(node: WorkflowPeek["definition"]["nodes"][number]): string {
  const spec = node.data?.spec_type;
  if (typeof spec === "string" && spec) return spec;
  return node.type ?? "step";
}

export function WorkflowSneakPeekContent({
  workflowId,
  active,
}: {
  workflowId: string;
  active: boolean;
}) {
  const { peek, state, error } = useWorkflowPeek(workflowId, active);

  if (state === "reading" || state === "idle") {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Reading the workflow…</span>
      </div>
    );
  }

  if (state === "failed" || !peek) {
    return (
      <p className="flex items-start gap-1.5 py-4 text-xs text-destructive">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {error ?? "This workflow could not be read."}
      </p>
    );
  }

  const variableNames = peek.variables
    .map((v) =>
      typeof v === "object" && v !== null && "name" in v
        ? String((v as { name: unknown }).name)
        : null,
    )
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-3">
      {peek.description && (
        <p className="text-xs leading-relaxed text-foreground/80">
          {peek.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {peek.version !== null && (
          <Badge variant="outline" className="py-0 text-[10px]">
            v{peek.version}
          </Badge>
        )}
        {peek.category && (
          <Badge variant="outline" className="py-0 text-[10px]">
            {peek.category}
          </Badge>
        )}
        {peek.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Takes
          </p>
          <code className="text-[11px] text-foreground/80">
            {peek.inputKind ?? "undeclared"}
          </code>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Delivers
          </p>
          <code className="text-[11px] text-foreground/80">
            {peek.outputKind ?? "undeclared"}
          </code>
        </div>
      </div>

      {variableNames.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Variable className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              Variables
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {variableNames.map((name) => (
              <code
                key={name}
                className="rounded bg-muted px-1 py-px text-[10.5px] text-foreground/80"
              >
                {name}
              </code>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <WorkflowIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {peek.definition.nodes.length} step
            {peek.definition.nodes.length === 1 ? "" : "s"} ·{" "}
            {peek.definition.edges.length} connection
            {peek.definition.edges.length === 1 ? "" : "s"}
          </span>
        </div>
        {peek.definition.nodes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            This workflow has no steps yet, so a run would do nothing.
          </p>
        ) : (
          <ol className="space-y-0.5">
            {peek.definition.nodes.map((node, index) => (
              <li
                key={node.id}
                className="flex items-baseline gap-2 rounded px-1.5 py-1 odd:bg-muted/40"
              >
                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">
                  {stepLabel(node)}
                </span>
                <code className="shrink-0 text-[10px] text-muted-foreground">
                  {stepType(node)}
                </code>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`${what} could not be copied — your browser refused clipboard access.`);
  }
}

/** The peek's copy menu: the whole definition, or just what a caller must feed it. */
export function WorkflowSneakPeekCopyMenu({
  workflowId,
}: {
  workflowId: string;
}) {
  const { peek, state } = useWorkflowPeek(workflowId, true);
  const ready = state === "ready" && peek !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready}
          title={
            ready
              ? "Copy this workflow's definition"
              : "Readable once the workflow has loaded"
          }
        >
          <Copy />
          Copy
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() =>
            peek && copy(JSON.stringify(peek.definition, null, 2), "Graph JSON")
          }
        >
          <Braces />
          Graph JSON (nodes + edges)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            peek &&
            copy(
              JSON.stringify(
                {
                  id: peek.id,
                  name: peek.name,
                  input_kind: peek.inputKind,
                  output_kind: peek.outputKind,
                  variables: peek.variables,
                  steps: peek.definition.nodes.map((node) => ({
                    id: node.id,
                    label: stepLabel(node),
                    spec_type: stepType(node),
                  })),
                },
                null,
                2,
              ),
              "Execution core",
            )
          }
        >
          <Check />
          Execution core (what a caller feeds it)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy(workflowId, "Workflow id")}>
          <Copy />
          Workflow id
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
